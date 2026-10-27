import { promptText } from '../prompt-loader/index.js';
import {createFinishBatchOperation,finishTool,localContextTools} from './operations/finish-batch.js';
import {toolDiagnostics,argumentDiagnostic,safeDiagnosticTool} from "../audit/diagnostics.js";
import {createHash,randomUUID} from 'node:crypto';
import {buildAutomationPrompt} from './prompt.js';
import {AUTOMATION_MAX_TOOL_CALLS,AUTOMATION_MAX_STAGE_CALLS} from './config.js';
import {driveSkillPrompt,isDriveTool} from '../skills/drive.js';
import {buildObservationHandoff} from './observation-handoff.js';
import {compactConversation} from './conversation-context.js';
import {canonicalJson,checkSchema,plainObject,validateArguments,validLabel,validSourceId,validUuid} from './validation.js';
const failure = (code,result) => { const error=new Error(code);if(plainObject(result?.diagnostics))error.diagnostics=result.diagnostics;throw error; };
export function createAutomationHandler({store,provider,tools=[],authorizeEvent,authorizeEvents,resolveClaimSourceIds,prepareBatch,cleanupBatch,validateCompletion,getPersonIdChoices,pipeline,principal,config,now=()=>new Date(),onProgress=()=>{},audit} = {}) {
  const finishOperation=createFinishBatchOperation({definition:finishTool,store,pipeline,validateCompletion});
  let running = false;
  let definitions;
  try {
    if (!Array.isArray(tools) || tools.length>32) throw new Error('invalid_tools');
    const names=new Set(['finish_batch']);
    definitions=tools.map(tool=>{
      if (!validLabel(tool.name)||names.has(tool.name)||tool.readOnly!==true&&tool.idempotent!==true||typeof tool.execute!=='function'||tool.prepareArguments!==undefined&&typeof tool.prepareArguments!=='function'||tool.getActionVersion!==undefined&&typeof tool.getActionVersion!=='function'||typeof tool.description!=='string'||tool.description.length>4000||tool.parameters?.type!=='object'||tool.phases!==undefined&&(!Array.isArray(tool.phases)||!tool.phases.length||tool.phases.some(phase=>!['initial','followup'].includes(phase)))) throw new Error('invalid_tools');
      checkSchema(tool.parameters);names.add(tool.name);
      return {name:tool.name,description:`${tool.readOnly===true?promptText("tools/worker/control#prefix.context"):promptText("tools/worker/control#prefix.action")}${tool.description}`,parameters:{type:'object',properties:{
        inputIds:{type:'array',items:{type:'string'},minItems:1,maxItems:20},arguments:structuredClone(tool.parameters),
      },required:['inputIds','arguments'],additionalProperties:false}};
    });
  } catch { definitions=null; }
  return {async tick({signal}={}) {
    if (!config?.enabled) return {status:'disabled'};
    if (running) return {status:'busy'};
    if (!definitions || !tools.length || (typeof authorizeEvent!=='function' && typeof authorizeEvents!=='function') || authorizeEvents!==undefined&&typeof authorizeEvents!=='function' || typeof provider?.toolTurn!=='function' || store?.configured===false) return {status:'not_configured'};
    if(resolveClaimSourceIds!==undefined&&typeof resolveClaimSourceIds!=='function')return {status:'not_configured'};
    if(pipeline!==undefined&&(!plainObject(pipeline)||typeof pipeline.beginCycle!=='function'||typeof pipeline.afterInitial!=='function'))return {status:'not_configured'};
    running=true;
    const progressStarted=performance.now();
    let stage=pipeline?'initial':'legacy',initialHandled=[],settleCycle;
    const executionLog=[];let executionBytes=0;
    const getExecutionLog=()=>structuredClone(executionLog);
    const recordExecution=async event=>{
      if(!pipeline)return;
      const entry={...structuredClone(event),sequence:executionLog.length+1,stage:event.stage||stage};
      const bytes=Buffer.byteLength(canonicalJson(entry));
      if(executionBytes+bytes>1048576)failure('context_limit');
      executionBytes+=bytes;executionLog.push(entry);
      if(pipeline.recordExecution)await guarded(()=>pipeline.recordExecution(structuredClone(entry)));
    };
    let auditContext,runResult={status:'unavailable'},claimedCount=0,runError;
    const outcome=value=>{runResult=value;return value;};
    const auditEvent=async event=>{
      if(!auditContext)return;
      try{await audit?.recordEvent({eventId:randomUUID(),context:{...auditContext,round:progressRound},...event});}catch{/* Provider dispatch independently enforces durable call logging. */}
    };
    let progressCount=0,progressRound=0,progressCalls=0,activeProgress,proposalSequence=0;
    const registeredNames=new Set([...tools.map(tool=>tool.name),'finish_batch']);
    const emitProgress=(phase,status,tool)=>{
      if(typeof onProgress!=='function'||progressCount>=320)return;
      progressCount++;
      const event={phase,status,round:Math.min(pipeline?26:16,progressRound),calls:Math.min((pipeline?2*AUTOMATION_MAX_STAGE_CALLS:AUTOMATION_MAX_STAGE_CALLS)+AUTOMATION_MAX_TOOL_CALLS,progressCalls),elapsedMs:Math.min(900000,Math.max(0,Math.round(performance.now()-progressStarted)))};
      if(registeredNames.has(tool))event.tool=tool;
      try{Promise.resolve(onProgress(Object.freeze(event))).catch(()=>{});}catch{/* Diagnostics never change execution. */}
    };
    const progressStart=async(phase,tool)=>{activeProgress={phase,tool,started:performance.now(),dispatched:false,proposalSequence};emitProgress(`${phase}_start`,'started',tool);};
    const markDispatched=async()=>{if(!activeProgress||activeProgress.dispatched)return;activeProgress.dispatched=true;await auditEvent({kind:'tool_started',tool:activeProgress.phase==='prepare'?'prepare_batch':activeProgress.tool,status:'started',counts:{sequence:progressCalls}});};
    const progressDone=async(status,error)=>{
      if(!activeProgress)return;
      const {phase,tool,started,dispatched,result,proposalSequence:sequence,validation}=activeProgress;activeProgress=undefined;
      status=typeof status==='string'&&/^[a-z][a-z0-9_]{0,63}$/.test(status)?status:'invalid_result';
      const publicStatus=['ready','pending','completed','already_succeeded','invalid_request','aborted','forbidden','failed'].includes(status)?status:'failed';
      emitProgress(`${phase}_done`,publicStatus,tool);
      if(phase==='tool'||phase==='prepare')await auditEvent({kind:'tool_finished',tool:phase==='prepare'?'prepare_batch':tool,status,diagnostics:toolDiagnostics({result,status:status==='ready'?undefined:status,error,dispatched,proposalSequence:sequence,validation,stage:phase==='prepare'?'prepare':undefined}),durationMs:Math.round(performance.now()-started),counts:{sequence:progressCalls}});
    };
    const rejectProposal=async(call,reason,validation,sequence=proposalSequence)=>{await auditEvent({kind:'tool_finished',tool:safeDiagnosticTool(call?.name),status:'invalid_tool_call',durationMs:0,diagnostics:toolDiagnostics({status:'invalid_tool_call',reason,stage:'local_validation',dispatched:false,proposalSequence:sequence,validation})});};
    const controller=new AbortController();
    let timedOut=false,leaseLost=false;
    const timeout=setTimeout(()=>{timedOut=true;controller.abort();},config.maxRunMs);timeout.unref?.();
    const combined=AbortSignal.any([signal,controller.signal].filter(Boolean));
    const guarded=async work=>{
      if (combined.aborted) failure('aborted');
      // Also bounds injected adapters that fail to observe AbortSignal.
      let listener;
      try { return await Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{
        listener=()=>reject(new Error('aborted'));combined.addEventListener('abort',listener,{once:true});
      })]); } finally { if(listener) combined.removeEventListener('abort',listener); }
    };
    let leaseToken,heartbeat,heartbeatBusy=false;
    try {
      // Resolve before any queue bodies leave storage. Production supplies only
      // current Discord grants plus its separately authorized Gmail source.
      const sourceIds=resolveClaimSourceIds?await guarded(()=>resolveClaimSourceIds({principal,signal:combined})):principal?.allowedSourceIds;
      if(resolveClaimSourceIds||store.requiresScopedClaims===true) {
        if(!Array.isArray(sourceIds)||sourceIds.length>500||!sourceIds.every(validUuid)||new Set(sourceIds).size!==sourceIds.length)failure('not_configured');
      }
      // Empty trusted scopes still poll SQL for bounded quarantine/expired-lease
      // maintenance. The scoped RPC cannot select any pending bodies for [].
      const claim=await guarded(()=>store.claim({config,allowedSourceIds:sourceIds?[...sourceIds]:undefined,signal:combined}));
      if (claim.status!=='ready') return outcome({status:claim.status});
      leaseToken=claim.leaseToken;
      const inputs=claim.inputs;
      auditContext={agent:'planner',runId:randomUUID()};
      claimedCount=Array.isArray(inputs)?inputs.length:0;
      await auditEvent({kind:'run_started',status:'started',counts:{inputs:claimedCount}});
      if (!validUuid(leaseToken)||!Array.isArray(inputs)||!inputs.length||inputs.length>config.maxInputs||Buffer.byteLength(JSON.stringify(inputs))>config.maxBytes||new Set(inputs.map(r=>r.uuid)).size!==inputs.length) failure('invalid_batch');
      for (const row of inputs) {
        const e=row.raw_response;
        if (!validUuid(row.uuid)||!plainObject(e)||!validLabel(e.source)||!validSourceId(e.source_id)||!validLabel(e.event_type)||!validSourceId(e.event_id)||!validSourceId(e.revision)||!Number.isFinite(Date.parse(e.received_at))||!Object.hasOwn(e,'payload')) failure('invalid_batch');
      }
      const authorize=async()=>{
        if(typeof authorizeEvents==='function') {
          if(await guarded(()=>authorizeEvents({events:inputs.map(row=>structuredClone(row.raw_response)),principal,signal:combined}))!==true)failure('forbidden');
          return;
        }
        for(const row of inputs) if (await guarded(()=>authorizeEvent({event:structuredClone(row.raw_response),principal,signal:combined}))!==true) failure('forbidden');
      };
      const renew=async()=>{
        const result=await guarded(()=>store.renew({leaseToken,leaseSeconds:config.leaseSeconds,signal:combined}));
        if(result.status!=='ready') failure('stale');
      };
      heartbeat=setInterval(()=>{
        if(heartbeatBusy) return;heartbeatBusy=true;
        renew().catch(()=>{leaseLost=true;controller.abort();}).finally(()=>{heartbeatBusy=false;});
      },20000);heartbeat.unref?.();
      await authorize();
      // Trusted adapters run only for an authorized, leased processing batch.
      // Their returned source context stays in the untrusted user message.
      let batchContext;
      if (prepareBatch !== undefined) {
        if (typeof prepareBatch !== 'function') failure('not_configured');
        await progressStart('prepare');
        await markDispatched();
        batchContext=await guarded(()=>prepareBatch({inputs:structuredClone(inputs),principal,signal:combined}));
        activeProgress.result=batchContext;
        if (!plainObject(batchContext)||batchContext.status!=='ready') failure('preflight_failed');
        if (Buffer.byteLength(canonicalJson(batchContext))>65536) failure('context_limit');
        await renew();await authorize();
        await progressDone('ready');
      }
      let system=buildAutomationPrompt({timezone:config.timezone,now:now(),phase:pipeline?'initial':undefined});
      let driveSkillActive=false;
      const inputIds=inputs.map(row=>row.uuid);
      const claimedInputIds=Object.freeze([...inputIds]);
      let initialFinishVerdict=null;
      let phaseInputIds=[...inputIds];
      // References are transport spelling only. Private maps are built solely
      // from the claimed queue and the authoritative follow-up snapshot.
      const referenceTag=pipeline?randomUUID().replaceAll('-','').slice(0,8):null;
      const referenceMap=(ids,prefix)=>{
        const bindings=ids.map((uuid,index)=>({ref:`${prefix}_${referenceTag}_${index+1}`,uuid}));
        return {bindings,toUuid:new Map(bindings.map(row=>[row.ref,row.uuid])),toRef:new Map(bindings.map(row=>[row.uuid,row.ref]))};
      };
      const queueReferences=pipeline?referenceMap(inputIds,'q'):null;
      let phaseReferences=queueReferences;
      const referenceBindings=()=>({phase:stage,inputIds:phaseReferences.bindings,handledInputIds:queueReferences.bindings,
        ...(stage==='initial'?{noChangeInputIds:queueReferences.bindings,missingInputIds:queueReferences.bindings}:{}),
        notice:promptText("agents/update/context#reference-bindings")});
      const translateReference=(value,map,wire)=>typeof value==='string'?(wire?map.toRef.get(value):map.toUuid.get(value))??value:value;
      const referenceArguments=(call,wire=false)=>{
        const args=structuredClone(call.arguments);
        if(!pipeline)return args;
        if(call.name==='finish_batch') {
          if(Array.isArray(args.handledInputIds))args.handledInputIds=args.handledInputIds.map(value=>translateReference(value,queueReferences,wire));
          if(stage==='initial')for(const field of ['noChangeInputIds','missingInputIds'])if(Array.isArray(args[field]))args[field]=args[field].map(value=>translateReference(value,queueReferences,wire));
        } else {
          if(Array.isArray(args.inputIds))args.inputIds=args.inputIds.map(value=>translateReference(value,phaseReferences,wire));
          if(stage==='followup'&&['read_pending_task','resolve_pending_task','defer_task'].includes(call.name)&&plainObject(args.arguments)&&Object.hasOwn(args.arguments,'taskId'))
            args.arguments.taskId=translateReference(args.arguments.taskId,phaseReferences,wire);
        }
        return args;
      };
      const formatModelResult=(result,toolName)=>{
        if(!pipeline||stage!=='followup'||!['read_pending_task','patch_map_participation','finish_batch'].includes(toolName)
          ||!plainObject(result)||!Array.isArray(result.resolutionOptions))return result;
        const resolutionHints=result.resolutionOptions.flatMap(option=>{
          const ref=phaseReferences.toRef.get(option?.taskId);
          if(!ref||!['completed','no_change_needed','source_missing'].includes(option.outcome)
            ||option.outcome==='no_change_needed'&&!['already_correct','no_actionable_request'].includes(option.reason))return [];
          return [{tool:'resolve_pending_task',arguments:{inputIds:[ref],arguments:{taskId:ref,outcome:option.outcome,
            ...(option.outcome==='no_change_needed'?{reason:option.reason}:{})}}}];
        });
        if(!resolutionHints.length)return result;
        const visible={...result,resolutionHints,
          resolutionHintNotice:promptText("agents/update/context#resolution-options")};
        return Buffer.byteLength(canonicalJson(visible))<=16384?visible:result;
      };
      const initialTaskCoverage=()=>{
        if(!pipeline||typeof pipeline.getInitialTaskCoverage!=='function')return [];
        const coverage=pipeline.getInitialTaskCoverage();
        if(!Array.isArray(coverage)||coverage.length>claimedInputIds.length
          ||new Set(coverage.map(row=>row?.inputId)).size!==coverage.length
          ||coverage.some(row=>!plainObject(row)||!claimedInputIds.includes(row.inputId)||!Number.isSafeInteger(row.taskCount)||row.taskCount<1||row.taskCount>500))failure('preflight_failed');
        return coverage;
      };
      const messages=[{role:'user',content:JSON.stringify({inputs,...(batchContext?{batchContext}:{}),...(pipeline?{referenceBindings:referenceBindings()}:{} )})}];
      const enforceMessageBudget=()=>{
        if(pipeline) {
          let snapshot=typeof pipeline.getConversationSnapshot==='function'?pipeline.getConversationSnapshot():undefined;
          if(snapshot?.status==='ready'&&Array.isArray(snapshot.tasks))snapshot={...snapshot,
            tasks:snapshot.tasks.map(row=>({...row,compact:formatModelResult(row.compact,'read_pending_task')}))};
          const compacted=compactConversation({messages,executionLog:getExecutionLog(),snapshot,referenceBindings:referenceBindings(),phase:stage});
          if(compacted.compacted)messages.splice(0,messages.length,...compacted.messages);
        }
        if(Buffer.byteLength(JSON.stringify(messages))>262144)failure('context_limit');
      };
      const callIds=new Set();
      let calls=0,stageCalls=0,stageRounds=0;
      const followupRounds=Math.min(10,config.followupRounds??10);
      const visibleDefinitions=()=>definitions.filter(def=>{const tool=tools.find(t=>t.name===def.name);return stage==='legacy'||!tool.phases||tool.phases.includes(stage);});
      settleCycle=async(followupStatus,handledIds=initialHandled)=>{
        const handledInputIds=[...new Set([...initialHandled,...handledIds])];
        if(!handledInputIds.length)return outcome({status:'round_limit',followupStatus,calls});
        await renew();await authorize();
        if(pipeline.finishCycle) {
          const checkpoint=await guarded(()=>finishOperation.execute({handledInputIds},{step:'checkpoint',inputs,principal,signal:combined,leaseToken,executionLog:getExecutionLog(),followupStatus}));
          if(checkpoint?.status!=='ready')failure('preflight_failed',checkpoint);
        }
        await renew();await authorize();
        const result=await guarded(()=>finishOperation.execute({handledInputIds},{step:'finish',leaseToken,principal,signal:combined}));
        if(result.status!=='ready')failure('stale');
        leaseToken=null;
        return outcome({status:'completed',handled:handledInputIds.length,remaining:inputs.length-handledInputIds.length,calls,followupStatus});
      };
      // Explicit user exception: after a successful initial finish, invoke the
      // registered synchronization operation as its OWN runner-originated call.
      // It is not fabricated as a model proposal and does not run on a cap.
      let initialSyncExecution;
      const runFinishSync=async()=>{
        const tool=tools.find(row=>row.name==='sync_calendars_to_map');
        if(!tool)return;
        const args={},scopedIds=[...claimedInputIds].sort(),callId=`runner_sync_${randomUUID().replaceAll('-','')}`;
        const actionKey=createHash('sha256').update(canonicalJson({inputIds:scopedIds,name:tool.name,arguments:args,...(tool.getActionVersion?{actionVersion:tool.getActionVersion()}: {})})).digest('hex');
        const stageLimit=stage==='followup'?(config.maxFollowupCalls??AUTOMATION_MAX_STAGE_CALLS):(config.maxCalls??AUTOMATION_MAX_STAGE_CALLS);
        if(stageCalls>=stageLimit) {
          const result={status:'tool_error',reason:'stage_call_limit',message:promptText("agents/update/recovery#sync-budget")};
          await recordExecution({kind:'tool_result',origin:'runner',tool:tool.name,callId,inputIds:scopedIds,arguments:args,result});
          await auditEvent({kind:'tool_finished',tool:tool.name,status:'call_limit',durationMs:0,diagnostics:toolDiagnostics({status:'call_limit',reason:'call_limit',dispatched:false}),counts:{sequence:progressCalls}});
          initialSyncExecution={name:tool.name,callId,origin:'runner',arguments:args,result};
          messages.push({role:'user',content:JSON.stringify({runnerToolExecution:initialSyncExecution})});
          return;
        }
        calls++;stageCalls++;progressCalls=calls;
        await progressStart('tool',tool.name);await renew();await authorize();
        const receipt=await guarded(()=>store.action({leaseToken,actionKey,signal:combined}));
        let result;
        if(receipt.status==='completed')result={status:'already_succeeded'};
        else {
          if(receipt.status!=='execute')failure('stale');
          await markDispatched();
          try {result=await guarded(()=>tool.execute(args,{principal,inputIds:scopedIds,idempotencyKey:actionKey,signal:combined,callId,phase:stage,origin:'runner'}));}
          catch(error) {
            if(combined.aborted)failure('aborted');
            if(error?.message==='audit_unavailable'||error?.code==='audit_unavailable')failure('audit_unavailable');
            result={status:'tool_error',reason:'tool_failed',message:promptText("agents/update/recovery#sync-failed")};
          }
          if(!plainObject(result)||typeof result.status!=='string'||Buffer.byteLength(canonicalJson(result))>16384)
            result={status:'tool_error',reason:'invalid_result',message:promptText("agents/update/recovery#sync-invalid-result")};
          if(result.status==='audit_unavailable')failure('audit_unavailable');
          if(['ready','ok','completed'].includes(result.status)) {
            const saved=await guarded(()=>store.action({leaseToken,actionKey,complete:true,signal:combined}));
            if(saved.status!=='completed')failure('stale');
          } else if(!['tool_error','partial'].includes(result.status))result={status:'tool_error',reason:'tool_failed',message:promptText("agents/update/recovery#sync-failed")};
        }
        activeProgress.result=result;
        await recordExecution({kind:'tool_result',origin:'runner',tool:tool.name,callId,inputIds:scopedIds,arguments:args,result});
        initialSyncExecution={name:tool.name,callId,origin:'runner',arguments:args,result};
        messages.push({role:'user',content:JSON.stringify({runnerToolExecution:initialSyncExecution})});
        await progressDone(['ready','ok','completed','already_succeeded'].includes(result.status)?'ready':'failed');
      };
      const startFollowup=async(handledInputIds,{afterFinish=false}={})=>{
        await renew();await authorize();
        initialHandled=[...handledInputIds];
        await recordExecution({kind:'initial_complete',handledInputIds:[...initialHandled]});
        if(afterFinish)await runFinishSync();
        const next=await guarded(()=>pipeline.afterInitial({handledInputIds:[...initialHandled],inputs:structuredClone(inputs),principal,signal:combined,leaseToken,executionLog:getExecutionLog()}));
        if(!plainObject(next)||next.status!=='ready'||next.inputIds!==undefined&&(!Array.isArray(next.inputIds)||next.inputIds.length>500||!next.inputIds.every(validUuid)||new Set(next.inputIds).size!==next.inputIds.length))failure('preflight_failed',next);
        if(Buffer.byteLength(canonicalJson(next))>262144)failure('context_limit');
        await recordExecution({kind:'deterministic_result',stage:'deterministic',result:next});
        for(const id of next.inputIds||[])if(!inputIds.includes(id))inputIds.push(id);
        phaseInputIds=[...(next.inputIds||[])];
        if(pipeline)phaseReferences=referenceMap(phaseInputIds,'t');
        stage='followup';stageCalls=0;stageRounds=0;
        system=buildAutomationPrompt({timezone:config.timezone,now:now(),phase:'followup'});
        const validatedAll=initialFinishVerdict?.status==='ready'
          &&canonicalJson([...initialFinishVerdict.handledInputIds].sort())===canonicalJson([...handledInputIds].sort())
          &&canonicalJson([...handledInputIds].sort())===canonicalJson([...claimedInputIds].sort());
        const followupPayload={stage:'followup',context:next.context??null,referenceBindings:referenceBindings(),
          ...(initialSyncExecution?{runnerToolExecution:structuredClone(initialSyncExecution)}:{})};
        let followupMessage={role:'user',content:JSON.stringify(followupPayload)};
        // Keep useful already-returned source/map observations when replacing
        // the initial transcript. This is visibility only: no provider call or
        // access receipt is replayed, and the existing message budget stays put.
        if(validatedAll) {
          const initialHistory=getExecutionLog();
          for(let budget=65536;budget>=1024;budget=Math.floor(budget/2)) {
            const observations=buildObservationHandoff(initialHistory,{maxBytes:budget});
            if(!observations.observations.length)break;
            const candidate={role:'user',content:JSON.stringify({...followupPayload,currentCycleObservations:observations})};
            if(Buffer.byteLength(JSON.stringify([candidate]))<=262144){followupMessage=candidate;break;}
          }
        }
        // Only model visibility changes. Full initial execution/task evidence,
        // fragments, receipts and every private runtime guard remain intact.
        if(validatedAll)messages.splice(0,messages.length,followupMessage);
        else messages.push(followupMessage);
        enforceMessageBudget();
        return next.followupRequired!==false;
      };
      if(pipeline){
        await guarded(()=>pipeline.beginCycle({leaseToken,inputs:structuredClone(inputs),principal,signal:combined,recordExecution,getExecutionLog}));
        if(typeof pipeline.getInitialTaskCoverage==='function') {
          const coverage=initialTaskCoverage(),coveredRefs=coverage.map(row=>queueReferences.toRef.get(row.inputId));
          const initial=JSON.parse(messages[0].content);
          initial.savedTaskCoverage={inputs:coverage.map(row=>({inputRef:queueReferences.toRef.get(row.inputId),taskCount:row.taskCount})),
            ...(coveredRefs.length?{completionHints:[{tool:'finish_batch',arguments:{handledInputIds:coveredRefs,noChangeInputIds:[]}}]}:{}),
            notice:promptText("agents/update/context#saved-task-coverage")};
          messages[0].content=JSON.stringify(initial);
        }
        await recordExecution({kind:'batch_context',inputs:structuredClone(inputs),...(batchContext?{batchContext}:{})});
      }
      for(let round=0;round<config.maxRounds+(pipeline?followupRounds:0);round++) {
        if(stage==='initial'&&stageRounds>=config.maxRounds&&!await startFollowup([]))return await settleCycle('not_needed');
        if(stage==='followup'&&stageRounds>=followupRounds)break;
        stageRounds++;
        await renew();await authorize();
        progressRound=round+1;progressCalls=calls;await progressStart('model');
        // Bound copying choices to the exact IDs already disclosed for this
        // phase. Keep the base schemas and larger/empty catalogues unchanged.
        const exactIds=phaseInputIds.length>0&&phaseInputIds.length<=20
          ?(pipeline?phaseReferences.bindings.map(row=>row.ref):[...phaseInputIds]):null;
        const requestDefinitions=visibleDefinitions().map(definition=>{
          const copy=structuredClone(definition);
          if(pipeline)copy.parameters.properties.inputIds.items={type:'string',minLength:1,maxLength:64};
          if(exactIds) {
            copy.parameters.properties.inputIds.items.enum=[...exactIds];
          }
          const taskId=copy.parameters.properties.arguments.properties?.taskId;
          if(stage==='followup'&&['read_pending_task','resolve_pending_task','defer_task'].includes(copy.name)&&taskId) {
            if(pipeline){taskId.minLength=1;taskId.maxLength=64;}
            if(exactIds)taskId.enum=[...exactIds];
          }
          return copy;
        });
        const canonicalFinishTool=structuredClone(finishTool);
        if(pipeline&&stage==='initial')for(const field of ['noChangeInputIds','missingInputIds'])canonicalFinishTool.parameters.properties[field]={type:'array',items:{type:'string'},minItems:0,maxItems:20};
        const requestFinishTool=structuredClone(canonicalFinishTool);
        if(pipeline) {
          requestFinishTool.description=promptText("tools/worker/control#finish.staged")
            +(stage==='initial'?promptText("tools/worker/control#finish.initial"):'');
          requestFinishTool.parameters.properties.handledInputIds.items={type:'string',minLength:1,maxLength:64,
            enum:queueReferences.bindings.map(row=>row.ref)};
          if(stage==='initial') {
            for(const field of ['noChangeInputIds','missingInputIds'])requestFinishTool.parameters.properties[field].items=structuredClone(requestFinishTool.parameters.properties.handledInputIds.items);
            const covered=new Set(initialTaskCoverage().map(row=>row.inputId));
            const noChangeChoices=queueReferences.bindings.filter(row=>!covered.has(row.uuid)).map(row=>row.ref);
            if(noChangeChoices.length)requestFinishTool.parameters.properties.noChangeInputIds.items.enum=noChangeChoices;
            else requestFinishTool.parameters.properties.noChangeInputIds.maxItems=0;
          }
        }
        const matches=(value,schema)=>{try{return validateArguments(value,schema);}catch{return false;}};
        const idChoices=(call,definition,rejection)=>{
          if((!pipeline&&!exactIds)||call.name==='finish_batch')return;
          const schema=definition.parameters,args=call.arguments;
          const outerInvalid=!Object.hasOwn(args,'inputIds')||!matches(args.inputIds,schema.properties.inputIds)||rejection.reason==='invalid_input_scope';
          const taskSchema=schema.properties.arguments.properties?.taskId;
          const taskField=stage==='followup'&&['read_pending_task','resolve_pending_task','defer_task'].includes(call.name)&&taskSchema;
          const nestedInvalid=taskField&&plainObject(args.arguments)&&(rejection.validation?.field==='arguments.taskId'||(Object.hasOwn(args.arguments,'taskId')
            ?!matches(args.arguments.taskId,taskSchema):schema.properties.arguments.required?.includes('taskId')));
          if(!outerInvalid&&!nestedInvalid)return;
          // Diagnose IDs only when the rest of the proposed arguments is valid.
          // These copies are never executed or used to repair the proposal.
          const remaining=structuredClone(args),rest=structuredClone(schema);
          delete remaining.inputIds;delete rest.properties.inputIds;
          rest.required=rest.required.filter(field=>field!=='inputIds');
          if(taskField&&plainObject(remaining.arguments)) {
            delete remaining.arguments.taskId;delete rest.properties.arguments.properties.taskId;
            if(rest.properties.arguments.required)rest.properties.arguments.required=rest.properties.arguments.required.filter(field=>field!=='taskId');
          }
          if(!matches(remaining,rest))return;
          return {phase:stage,field:outerInvalid?'inputIds':'arguments.taskId',...(exactIds?{choices:[...exactIds]}:{}),
            instruction:pipeline?promptText("agents/update/context#copy-reference"):promptText("agents/update/context#copy-id")};
        };
        const personIdChoices=async(call,wire,execution,definition,canonicalDefinition,rejection)=>{
          if(!pipeline||call.name!=='defer_task'||rejection.reason!=='invalid_arguments'||typeof getPersonIdChoices!=='function'
            ||!plainObject(execution.arguments.arguments)||!Object.hasOwn(execution.arguments.arguments,'personId'))return;
          const personSchema=canonicalDefinition.parameters.properties.arguments.properties.personId;
          if(!plainObject(personSchema))return;
          if(matches(execution.arguments.arguments.personId,personSchema))return;
          for(const [args,schema] of [[wire.arguments,definition.parameters],[execution.arguments,canonicalDefinition.parameters]]) {
            const remaining=structuredClone(args),rest=structuredClone(schema);
            delete remaining.arguments.personId;delete rest.properties.arguments.properties.personId;
            if(rest.properties.arguments.required)rest.properties.arguments.required=rest.properties.arguments.required.filter(key=>key!=='personId');
            if(!matches(remaining,rest))return;
          }
          const ids=execution.arguments.inputIds,taskId=execution.arguments.arguments.taskId;
          if(new Set(ids).size!==ids.length||!ids.every(id=>validUuid(id)&&phaseInputIds.includes(id))
            ||stage==='followup'&&taskId!==undefined&&!phaseInputIds.includes(taskId))return;
          let choices;
          try {choices=await guarded(()=>getPersonIdChoices({principal,inputIds:[...ids],phase:stage,signal:combined}));}
          catch {if(combined.aborted)failure('aborted');return;}
          if(!Array.isArray(choices)||!choices.length||choices.length>20||new Set(choices).size!==choices.length
            ||!choices.every(id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)&&matches(id,personSchema)))return;
          return {phase:stage,field:'arguments.personId',choices:[...choices],instruction:promptText("agents/update/recovery#exact-person-id")};
        };
        enforceMessageBudget();
        const turn=await guarded(()=>provider.toolTurn({system:system+driveSkillPrompt(driveSkillActive),messages:structuredClone(messages),tools:structuredClone([...requestDefinitions,requestFinishTool]),maxToolCalls:AUTOMATION_MAX_TOOL_CALLS,signal:combined,auditContext:{...auditContext,round:round+1}}));
        await recordExecution({kind:'model_result',round:progressRound,result:turn??null});
        if (!plainObject(turn)||!Array.isArray(turn.toolCalls)||!turn.toolCalls.length||turn.toolCalls.length>AUTOMATION_MAX_TOOL_CALLS||!['tool_calls','tool_use'].includes(turn.stopReason)) failure('incomplete_batch');
        const turnIds=new Set(),rejections=new Map();
        // Protocol errors and unknown/hidden tools remain fatal for the whole turn.
        for(const call of turn.toolCalls) {
          proposalSequence++;
          if (!plainObject(call)||typeof call.id!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(call.id)||callIds.has(call.id)||turnIds.has(call.id)||!plainObject(call.arguments)) {await rejectProposal(call,'invalid_tool_call');failure('invalid_tool_call');}
          turnIds.add(call.id);
          const definition=call.name==='finish_batch'?requestFinishTool:requestDefinitions.find(t=>t.name===call.name);
          if(!definition){await rejectProposal(call,'unknown_tool');failure('invalid_tool_call');}
        }
        // Keep the provider proposal/native transcript untouched. Only these
        // private clones enter canonical validation, receipts and tool adapters.
        const executionCalls=turn.toolCalls.map(call=>({...call,arguments:referenceArguments(call)}));
        const finish=turn.toolCalls.find(c=>c.name==='finish_batch');
        for(const [index,call] of turn.toolCalls.entries()) {
          const definition=call.name==='finish_batch'?requestFinishTool:requestDefinitions.find(t=>t.name===call.name);
          const canonicalDefinition=call.name==='finish_batch'?canonicalFinishTool:definitions.find(t=>t.name===call.name);
          const execution=executionCalls[index],wire={...call,arguments:referenceArguments(call,true)};
          const emptyFinish=turn.toolCalls.length===1&&call.name==='finish_batch'&&Object.keys(call.arguments).length===1
            &&Array.isArray(call.arguments.handledInputIds)&&call.arguments.handledInputIds.length===0;
          if(pipeline&&call.name==='finish_batch'&&matches(execution.arguments,canonicalFinishTool.parameters)
            &&(new Set(execution.arguments.handledInputIds).size!==execution.arguments.handledInputIds.length
              ||!execution.arguments.handledInputIds.every(id=>validUuid(id)&&claimedInputIds.includes(id))
              ||stage==='initial'&&['noChangeInputIds','missingInputIds'].some(field=>new Set(execution.arguments[field]||[]).size!==(execution.arguments[field]||[]).length
                ||(execution.arguments[field]||[]).some(id=>!validUuid(id)||!claimedInputIds.includes(id))))) {
            await rejectProposal(call,'invalid_completion_scope',{keyword:'scope',field:'handledInputIds'});failure('invalid_completion');
          }
          let rejection;
          if(!matches(wire.arguments,definition.parameters)&&!emptyFinish)
            rejection={reason:'invalid_arguments',validation:argumentDiagnostic(wire.arguments,definition.parameters)};
          else if(!matches(execution.arguments,canonicalDefinition.parameters)&&!emptyFinish)
            rejection={reason:'invalid_arguments',validation:argumentDiagnostic(execution.arguments,canonicalDefinition.parameters)};
          else if(call.name!=='finish_batch'&&(new Set(execution.arguments.inputIds).size!==execution.arguments.inputIds.length||!execution.arguments.inputIds.every(id=>validUuid(id)&&(pipeline?phaseInputIds:inputIds).includes(id))))
            rejection={reason:'invalid_input_scope',validation:{keyword:'scope',field:'inputIds'}};
          else if(pipeline&&stage==='followup'&&['read_pending_task','resolve_pending_task','defer_task'].includes(call.name)&&Object.hasOwn(execution.arguments.arguments,'taskId')&&!phaseInputIds.includes(execution.arguments.arguments.taskId))
            rejection={reason:'invalid_input_scope',validation:{keyword:'scope',field:'arguments.taskId'}};
          if(rejection) {
            if(finish){await rejectProposal(call,rejection.reason,rejection.validation,proposalSequence-turn.toolCalls.length+index+1);failure('invalid_tool_call');}
            rejections.set(call.id,{...rejection,exactIds:idChoices(wire,definition,rejection),
              exactPersonIds:await personIdChoices(call,wire,execution,definition,canonicalDefinition,rejection)});
          } else if(pipeline&&stage==='initial'&&call.name==='finish_batch') {
            // Both explicit lists passed reference, schema and duplicate checks.
            // Normalize only the private clone; raw proposals remain unchanged.
            const declared=new Set([...execution.arguments.handledInputIds,...(execution.arguments.noChangeInputIds||[])]);
            execution.arguments.handledInputIds=claimedInputIds.filter(id=>declared.has(id));
          }
        }
        await progressDone('ready');
        const consumeTurn=async()=>{
          calls+=turn.toolCalls.length;stageCalls+=turn.toolCalls.length;progressCalls=calls;
          const stageLimit=stage==='followup'?(config.maxFollowupCalls??AUTOMATION_MAX_STAGE_CALLS):(config.maxCalls??AUTOMATION_MAX_STAGE_CALLS);
          if(stageCalls>stageLimit) {for(const call of turn.toolCalls)await rejectProposal(call,'call_limit');failure('call_limit');}
          for(const id of turnIds)callIds.add(id);
        };
        if(finish&&turn.toolCalls.length!==1) {
          await consumeTurn();
          if(!pipeline||turn.toolCalls.filter(call=>call.name==='finish_batch').length!==1) {
            await rejectProposal(finish,'invalid_completion');failure('invalid_completion');
          }
          // All calls already passed protocol, schema and scope validation.
          // Reject this staged combination atomically; never split or dispatch it.
          messages.push({role:'assistant',content:'',toolCalls:structuredClone(turn.toolCalls)});
          for(const [index,call] of turn.toolCalls.entries()) {
            const reason=call.name==='finish_batch'?'invalid_completion':'unattempted';
            const feedback={status:'tool_error',reason,message:call.name==='finish_batch'
              ?promptText("agents/update/recovery#finish-alone")
              :promptText("agents/update/recovery#turn-rejected")};
            await rejectProposal(call,reason,undefined,proposalSequence-turn.toolCalls.length+index+1);
            await recordExecution({kind:'tool_result',tool:call.name,callId:call.id,result:feedback});
            messages.push({role:'tool',toolCallId:call.id,content:JSON.stringify(feedback)});
          }
          enforceMessageBudget();
          continue;
        }
        if(rejections.size) {
          // Reject atomically: even valid peers get no preparation, receipt or dispatch.
          await consumeTurn();
          messages.push({role:'assistant',content:'',toolCalls:structuredClone(turn.toolCalls)});
          for(const [index,call] of turn.toolCalls.entries()) {
            const rejection=rejections.get(call.id)??{reason:'unattempted'};
            const sequence=proposalSequence-turn.toolCalls.length+index+1;
            const diagnostics=toolDiagnostics({status:'invalid_tool_call',reason:rejection.reason,validation:rejection.validation,dispatched:false});
            const feedback={status:'tool_error',reason:rejection.reason,
              ...(rejection.validation?{validationCode:diagnostics.validationCode,schemaFieldId:diagnostics.schemaFieldId}:{}),
              ...(rejection.exactIds?{exactIds:rejection.exactIds}:{}),
              ...(rejection.exactPersonIds?{exactPersonIds:rejection.exactPersonIds}:{}),
              message:promptText("agents/update/recovery#turn-rejected")};
            await rejectProposal(call,rejection.reason,rejection.validation,sequence);
            await recordExecution({kind:'tool_result',tool:call.name,callId:call.id,result:feedback});
            messages.push({role:'tool',toolCallId:call.id,content:JSON.stringify(feedback)});
          }
          enforceMessageBudget();
          continue;
        }
        if(pipeline&&stage==='followup') {
          const groups=new Map();
          for(const call of executionCalls)if(call.name==='patch_map_participation') {
            const id=call.arguments.arguments.eventId;
            if(typeof id!=='string')continue;
            if(!groups.has(id))groups.set(id,[]);groups.get(id).push(call.id);
          }
          const siblings=new Set([...groups.values()].filter(group=>group.length>1).flat());
          if(siblings.size) {
            await consumeTurn();
            // Same-parent patches share one CAS token and are dependent. Reject
            // the complete validated reply without preparing or dispatching it.
            messages.push({role:'assistant',content:'',toolCalls:structuredClone(turn.toolCalls)});
            for(const [index,call] of turn.toolCalls.entries()) {
              const reason=siblings.has(call.id)?'same_event_participation_calls':'unattempted';
              const feedback={status:'tool_error',reason,message:siblings.has(call.id)
                ?promptText("agents/update/recovery#group-participation")
                :promptText("agents/update/recovery#turn-rejected")};
              await rejectProposal(call,reason,undefined,proposalSequence-turn.toolCalls.length+index+1);
              await recordExecution({kind:'tool_result',tool:call.name,callId:call.id,result:feedback});
              messages.push({role:'tool',toolCallId:call.id,content:JSON.stringify(feedback)});
            }
            enforceMessageBudget();
            continue;
          }
          if(typeof pipeline.preflightParticipation==='function') {
            const unread=new Map();
            for(const call of executionCalls)if(call.name==='patch_map_participation') {
              const result=await guarded(()=>pipeline.preflightParticipation({context:{principal,inputIds:call.arguments.inputIds,signal:combined},changes:call.arguments.arguments.changes}));
              if(result?.status==='read_required') {
                if(!Array.isArray(result.requiredTaskReads)||!result.requiredTaskReads.length||result.requiredTaskReads.length>20)failure('preflight_failed');
                const requiredTaskReads=result.requiredTaskReads.map(row=>{
                  const taskRef=phaseReferences.toRef.get(row.taskId);
                  if(!taskRef||!call.arguments.inputIds.includes(row.taskId)||typeof row.updatedAt!=='string')failure('preflight_failed');
                  if(row.fragment&&(!validUuid(row.fragment.id)||!Number.isSafeInteger(row.fragment.nextOffset)||row.fragment.nextOffset<1))failure('preflight_failed');
                  return {taskRef,updatedAt:row.updatedAt,...(row.fragment?{fragment:{id:row.fragment.id,nextOffset:row.fragment.nextOffset}}:{})};
                });
                unread.set(call.id,requiredTaskReads);
              } else if(result?.status!=='ready')failure('preflight_failed');
            }
            if(unread.size) {
              await consumeTurn();
              messages.push({role:'assistant',content:'',toolCalls:structuredClone(turn.toolCalls)});
              for(const [index,call] of turn.toolCalls.entries()) {
                const requiredTaskReads=unread.get(call.id),reason=requiredTaskReads?'participation_task_not_ready':'unattempted';
                const feedback={status:'tool_error',reason,...(requiredTaskReads?{requiredTaskReads}:{}),message:requiredTaskReads
                  ?promptText("agents/update/recovery#complete-task-read")
                  :promptText("agents/update/recovery#turn-rejected")};
                await rejectProposal(call,reason,undefined,proposalSequence-turn.toolCalls.length+index+1);
                await recordExecution({kind:'tool_result',tool:call.name,callId:call.id,result:feedback});
                messages.push({role:'tool',toolCallId:call.id,content:JSON.stringify(feedback)});
              }
              enforceMessageBudget();
              continue;
            }
          }
        }
        // Validate first, then load the reviewed skill and ask for a fresh plan.
        // No action, receipt, call ID or tool budget is consumed by activation.
        if(!driveSkillActive&&turn.toolCalls.some(call=>isDriveTool(call.name))) {
          driveSkillActive=true;
          continue;
        }
        await consumeTurn();
        if(finish) {
          if(turn.toolCalls.length!==1) {await rejectProposal(finish,'invalid_completion');failure('invalid_completion');}
          const handledInputIds=executionCalls.find(call=>call.name==='finish_batch').arguments.handledInputIds;
          if(new Set(handledInputIds).size!==handledInputIds.length||!handledInputIds.every(id=>validUuid(id)&&inputs.some(row=>row.uuid===id))) {await rejectProposal(finish,'invalid_completion_scope',{keyword:'scope',field:'handledInputIds'});failure('invalid_completion');}
          await progressStart('tool','finish_batch');
          await renew();await authorize();
          if(pipeline) {
            if(stage==='initial'&&typeof pipeline.validateInitialFinish==='function') {
              const finishArguments=executionCalls.find(call=>call.name==='finish_batch').arguments;
              const noChangeInputIds=finishArguments.noChangeInputIds||[],missingInputIds=finishArguments.missingInputIds||[];
              const completion=await guarded(()=>finishOperation.execute({handledInputIds,noChangeInputIds,missingInputIds},{step:'validate_initial',principal,signal:combined}));
              if(completion?.status==='pending') {
                const uncoveredInputRefs=(completion.uncoveredInputIds||[]).map(id=>queueReferences.bindings.find(binding=>binding.uuid===id)).filter(Boolean);
                if(!uncoveredInputRefs.length||uncoveredInputRefs.length>20)failure('preflight_failed');
                const response={status:'pending',reason:'uncovered_inputs',uncoveredInputRefs,
                  message:promptText("agents/update/recovery#uncovered-inputs")};
                messages.push({role:'assistant',content:typeof turn.text==='string'?turn.text:'',toolCalls:structuredClone(turn.toolCalls)},
                  {role:'tool',toolCallId:finish.id,content:JSON.stringify(formatModelResult(response,'finish_batch'))});
                await recordExecution({kind:'tool_result',tool:'finish_batch',result:response});
                enforceMessageBudget();
                await progressDone('pending');continue;
              }
              if(completion?.status==='invalid_request') {await rejectProposal(finish,'invalid_completion');failure('invalid_completion');}
              if(completion?.status!=='ready')failure('preflight_failed',completion);
              initialFinishVerdict=Object.freeze({status:completion.status,handledInputIds:Object.freeze([...handledInputIds])});
            }
            if(stage==='followup'&&typeof pipeline.validateFinish==='function') {
              const completion=await guarded(()=>finishOperation.execute({handledInputIds},{step:'validate_followup',principal,signal:combined}));
              if(completion?.status==='pending') {
                const response={...completion,taskRefs:(completion.taskIds||[]).map(id=>phaseReferences.bindings.find(binding=>binding.uuid===id)).filter(Boolean)};
                if(Buffer.byteLength(canonicalJson(response))>16384)failure('context_limit');
                messages.push({role:'assistant',content:typeof turn.text==='string'?turn.text:'',toolCalls:structuredClone(turn.toolCalls)},
                  {role:'tool',toolCallId:finish.id,content:JSON.stringify(formatModelResult(response,'finish_batch'))});
                await recordExecution({kind:'tool_result',tool:'finish_batch',result:response});
                enforceMessageBudget();
                await progressDone('pending');continue;
              }
              if(completion?.status!=='ready')failure('preflight_failed',completion);
            }
            const response={status:'ready',stage,handledInputIds};
            messages.push({role:'assistant',content:typeof turn.text==='string'?turn.text:'',toolCalls:structuredClone(turn.toolCalls)},
              {role:'tool',toolCallId:finish.id,content:JSON.stringify(response)});
            await recordExecution({kind:'tool_result',tool:'finish_batch',result:response});
            await progressDone('ready');
            if(stage==='initial'){if(!await startFollowup(handledInputIds,{afterFinish:true}))return await settleCycle('not_needed');continue;}
            return await settleCycle('completed',handledInputIds);
          }
          let completion;
          if(validateCompletion!==undefined) {
            if(typeof validateCompletion!=='function')failure('not_configured');
            await markDispatched();
            completion=await guarded(()=>finishOperation.execute({handledInputIds},{step:'validate_legacy',principal,signal:combined}));
            if(!plainObject(completion)||!['ready','pending'].includes(completion.status)||Buffer.byteLength(canonicalJson(completion))>16384)failure('invalid_completion');
          }
          if(handledInputIds.length===0||completion?.status==='pending') {
              const feedback=handledInputIds.length===0?{status:'pending',reason:'empty_handled_input_ids',queuedInputIds:[...inputIds],
                notice:promptText("agents/update/recovery#empty-finish"),
                ...(completion?{completion:{status:completion.status},nextActions:Array.isArray(completion.nextActions)?completion.nextActions.slice(0,5):[]}:{nextActions:[]})}:completion;
              if(handledInputIds.length===0)while(Buffer.byteLength(canonicalJson(feedback))>16384&&feedback.nextActions.length)feedback.nextActions.pop();
              if(Buffer.byteLength(canonicalJson(feedback))>16384)failure('context_limit');
              messages.push({role:'assistant',content:'',toolCalls:structuredClone(turn.toolCalls)},
                {role:'tool',toolCallId:finish.id,content:JSON.stringify(feedback)});
              enforceMessageBudget();
              activeProgress.result=feedback;
              await progressDone('pending');
              continue;
          }
          await markDispatched();
          const result=await guarded(()=>finishOperation.execute({handledInputIds},{step:'finish',leaseToken,principal,signal:combined}));
          if(result.status!=='ready') failure('stale');
          leaseToken=null;
          activeProgress.result={status:'completed'};
          await progressDone('completed');
          return outcome({status:'completed',handled:handledInputIds.length,remaining:inputs.length-handledInputIds.length,calls});
        }
        messages.push({role:'assistant',content:typeof turn.text==='string'?turn.text:'',toolCalls:structuredClone(turn.toolCalls)});
        for(const [proposalIndex,call] of executionCalls.entries()) {
          await progressStart('tool',call.name);
          activeProgress.proposalSequence=proposalSequence-turn.toolCalls.length+proposalIndex+1;
          await renew();
          const tool=tools.find(t=>t.name===call.name);
          const scopedIds=[...call.arguments.inputIds].sort();
          let executionArguments=structuredClone(call.arguments.arguments);
          const reportToolFailure=async({status='failed',result,error}={})=>{
            // Failed tool bodies and exception text never enter model/task context.
            const diagnostics=toolDiagnostics({result,status,error,dispatched:activeProgress.dispatched,
              proposalSequence:activeProgress.proposalSequence});
            const statusReason=toolDiagnostics({status}).reason;
            const reason=['unknown','none'].includes(diagnostics.reason)
              ?(['unknown','none'].includes(statusReason)?'tool_failed':statusReason):diagnostics.reason;
            let feedback={status:'tool_error',reason,message:promptText("agents/update/recovery#tool-failed")};
            // Only these private cache outcomes may disclose recovery fields.
            // Never forward an arbitrary failed body or its message text.
            const taskBinding=pipeline&&stage==='followup'&&['read_pending_task','read_context_fragment'].includes(call.name)
              &&result?.status==='invalid_request'&&['pending_task_fragment_scope','pending_task_fragment_offset','pending_task_fragment_stale'].includes(result.reason)
              &&phaseReferences.bindings.find(binding=>binding.uuid===result.taskId);
            if(taskBinding)feedback={status:'tool_error',reason:result.reason,taskRef:taskBinding.ref,
              ...(result.reason==='pending_task_fragment_offset'&&Number.isSafeInteger(result.nextOffset)&&result.nextOffset>=0?{nextOffset:result.nextOffset}:{}),
              message:result.reason==='pending_task_fragment_stale'?promptText("agents/update/recovery#task-read-again")
                :result.reason==='pending_task_fragment_offset'?promptText("agents/update/recovery#task-fragment-next")
                :promptText("agents/update/recovery#task-fragment-scope")};
            // Only this fixed internal participation outcome may disclose the
            // proposed IDs and literal absent endpoint names. Rebuild it from
            // the call; arbitrary failure bodies/messages remain private.
            if(pipeline&&stage==='followup'&&call.name==='patch_map_participation'&&plainObject(result)
              &&result.status==='invalid_request'&&result.reason==='new_participation_window_required'
              &&Object.keys(result).sort().join(',')==='missingWindows,reason,status'
              &&Array.isArray(result.missingWindows)&&result.missingWindows.length>0&&result.missingWindows.length<=20
              &&Array.isArray(executionArguments.changes)&&executionArguments.changes.length<=20) {
              const changes=executionArguments.changes,missingWindows=[],seen=new Set();
              for(const row of result.missingWindows) {
                const proposed=plainObject(row)&&changes.filter(change=>change.personId===row.personId);
                if(!proposed||proposed.length!==1||seen.has(row.personId)||Object.keys(row).sort().join(',')!=='missingFields,personId'
                  ||!Array.isArray(row.missingFields)||!row.missingFields.length||row.missingFields.length>2)break;
                const missingFields=['start','end'].filter(field=>!Object.hasOwn(proposed[0],field));
                if(canonicalJson(row.missingFields)!==canonicalJson(missingFields))break;
                seen.add(proposed[0].personId);missingWindows.push({personId:proposed[0].personId,missingFields});
              }
              if(missingWindows.length===result.missingWindows.length)feedback={status:'tool_error',reason:'new_participation_window_required',missingWindows,
                message:promptText("agents/update/recovery#participation-endpoints")};
            }
            activeProgress.result={status,diagnostics:{...diagnostics,reason:feedback.reason}};
            await recordExecution({kind:'tool_result',tool:call.name,callId:call.id,inputIds:scopedIds,
              arguments:structuredClone(executionArguments),result:feedback});
            messages.push({role:'tool',toolCallId:call.id,content:JSON.stringify(feedback)});
            await progressDone(status,error);
          };
          const throwIfRunStopped=error=>{
            if(combined.aborted)failure('aborted');
            if(error?.message==='audit_unavailable'||error?.code==='audit_unavailable')failure('audit_unavailable');
          };
          if(tool.prepareArguments) {
            try {executionArguments=await guarded(()=>tool.prepareArguments(executionArguments,{principal,inputIds:scopedIds,signal:combined}));}
            catch(error){throwIfRunStopped(error);await reportToolFailure({error});continue;}
            if(!validateArguments(executionArguments,tool.parameters)){activeProgress.validation=argumentDiagnostic(executionArguments,tool.parameters);failure('invalid_tool_call');}
          }
          const actionKey=createHash('sha256').update(canonicalJson({inputIds:scopedIds,name:call.name,arguments:executionArguments,...(tool.getActionVersion?{actionVersion:tool.getActionVersion()}: {})})).digest('hex');
          const receipt=tool.readOnly===true?{status:'execute'}:await guarded(()=>store.action({leaseToken,actionKey,signal:combined}));
          let result;
          if(receipt.status==='completed') result={status:'already_succeeded'};
          else {
            if(receipt.status!=='execute') failure('stale');
            // Business reads/actions retain a fresh check after reservation;
            // local cache bookkeeping must not wait for live source providers.
            if(!localContextTools.has(call.name))await authorize();
            await markDispatched();
            try {result=await guarded(()=>tool.execute(executionArguments,{principal,inputIds:scopedIds,idempotencyKey:actionKey,signal:combined,
              ...(pipeline?{callId:call.id,phase:stage}:{})}));}
            catch(error){throwIfRunStopped(error);await reportToolFailure({error});continue;}
            throwIfRunStopped();
            let resultStatus,resultBytes;
            try {
              if(!plainObject(result)||typeof result.status!=='string')throw new Error('invalid_result');
              resultStatus=result.status;
              resultBytes=Buffer.byteLength(canonicalJson(result));
            } catch {
              await reportToolFailure({status:'invalid_result'});continue;
            }
            if(resultStatus==='audit_unavailable')failure('audit_unavailable');
            if(resultBytes>16384){await reportToolFailure({status:'result_too_large'});continue;}
            if(!['ready','success','succeeded','completed','ok'].includes(resultStatus)&&!(call.name==='sync_calendars_to_map'&&resultStatus==='partial')) {
              // Tool-local stale/aborted outcomes do not cancel an active run.
              // Actual lease and whole-run state are checked independently.
              const statusReason=toolDiagnostics({status:resultStatus}).reason;
              await reportToolFailure({status:statusReason==='unknown'?'failed':resultStatus,result});continue;
            }
            if(tool.readOnly!==true&&resultStatus!=='partial') {
              const saved=await guarded(()=>store.action({leaseToken,actionKey,complete:true,signal:combined}));
              if(saved.status!=='completed') failure('stale');
            }
          }
          activeProgress.result=result;
          await recordExecution({kind:'tool_result',tool:call.name,callId:call.id,inputIds:scopedIds,arguments:structuredClone(executionArguments),result});
          messages.push({role:'tool',toolCallId:call.id,content:JSON.stringify(formatModelResult(result,call.name))});
          await progressDone(result.status==='already_succeeded'?'already_succeeded':result.status==='partial'?'partial':'ready');
        }
        enforceMessageBudget();
      }
      if(pipeline&&stage==='followup')return await settleCycle('round_limit');
      return outcome({status:'round_limit'});
    } catch(e) {
      runError=e;
      await progressDone(e?.message==='aborted'?'aborted':e?.message==='forbidden'?'forbidden':'failed',e);
      if(pipeline&&stage==='followup'&&['tool_failed','incomplete_batch','call_limit'].includes(e?.message)&&!combined.aborted) {
        try{return await settleCycle(e.message);}catch(settlementError){e=settlementError;runError=e;}
      }
      const allowed=new Set(['aborted','forbidden','stale','invalid_batch','incomplete_batch','call_limit','invalid_tool_call','invalid_completion','tool_failed','context_limit','preflight_failed','not_configured','audit_unavailable']);
      return outcome({status:allowed.has(e?.message)?e.message:'unavailable'});
    } finally {
      clearTimeout(timeout);clearInterval(heartbeat);
      if(leaseToken) {
        try {
          const settlement={leaseToken,signal:AbortSignal.timeout(15000)};
          // Only explicit caller shutdown is free of failure accounting. Internal
          // run deadlines and lease heartbeat failures are bounded failed runs.
          if(runResult.status==='aborted'&&signal?.aborted) await store.release(settlement);
          else if(typeof store.fail==='function') await store.fail({...settlement,
            outcome:timedOut?'timeout':leaseLost?'stale':runResult.status==='aborted'?'unavailable':runResult.status});
          else await store.release(settlement); // Legacy injected test/custom stores.
        } catch { /* Never mask failed accounting with release: expiry recovers it. */ }
      }
      try { cleanupBatch?.()?.catch?.(()=>{}); } catch { /* Cleanup cannot change the leased outcome. */ }
      await auditEvent({kind:'run_finished',status:runResult.status,diagnostics:toolDiagnostics({status:runResult.status,error:runError,reason:timedOut?'timeout':leaseLost?'stale':runError?.diagnostics?.reason??runResult.status,stage:runError?.diagnostics?.stage??'orchestration',dispatched:false}),durationMs:Math.round(performance.now()-progressStarted),counts:{inputs:claimedCount,handled:runResult.handled||0,remaining:runResult.remaining??claimedCount,calls:progressCalls}});
      running=false;
    }
  }};
}
