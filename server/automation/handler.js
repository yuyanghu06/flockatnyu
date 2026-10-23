import {toolDiagnostics,argumentDiagnostic,safeDiagnosticTool} from '../tool-diagnostics.js';
import {createHash,randomUUID} from 'node:crypto';
import {buildAutomationPrompt} from './prompt.js';
import {AUTOMATION_MAX_TOOL_CALLS,AUTOMATION_MAX_STAGE_CALLS} from './config.js';
import {driveSkillPrompt,isDriveTool} from '../skills/drive.js';
import {canonicalJson,checkSchema,plainObject,validateArguments,validLabel,validSourceId,validUuid} from './validation.js';
const finishTool = {name:'finish_batch',description:'Call alone with {handledInputIds}, not the ordinary {inputIds,arguments} wrapper. Include only handled queue UUIDs whose required actions succeeded or were durably deferred. In a staged cycle, [] ends the current phase without claiming additional inputs; unfinished work survives. In legacy mode, [] returns pending and cannot complete the batch. Backend completion checks still apply.',parameters:{type:'object',properties:{handledInputIds:{type:'array',items:{type:'string'},minItems:0,maxItems:20}},required:['handledInputIds'],additionalProperties:false}};
const failure = code => { throw new Error(code); };
export function createAutomationHandler({store,provider,tools=[],authorizeEvent,authorizeEvents,resolveClaimSourceIds,prepareBatch,cleanupBatch,validateCompletion,pipeline,principal,config,now=()=>new Date(),onProgress=()=>{},audit} = {}) {
  let running = false;
  let definitions;
  try {
    if (!Array.isArray(tools) || tools.length>32) throw new Error('invalid_tools');
    const names=new Set(['finish_batch']);
    definitions=tools.map(tool=>{
      if (!validLabel(tool.name)||names.has(tool.name)||tool.readOnly!==true&&tool.idempotent!==true||typeof tool.execute!=='function'||tool.prepareArguments!==undefined&&typeof tool.prepareArguments!=='function'||typeof tool.description!=='string'||tool.description.length>4000||tool.parameters?.type!=='object'||tool.phases!==undefined&&(!Array.isArray(tool.phases)||!tool.phases.length||tool.phases.some(phase=>!['initial','followup'].includes(phase)))) throw new Error('invalid_tools');
      checkSchema(tool.parameters);names.add(tool.name);
      return {name:tool.name,description:`${tool.readOnly===true?'Read-only context tool. ':'Idempotent action tool. '}${tool.description}`,parameters:{type:'object',properties:{
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
    const rejectProposal=async(call,reason,validation)=>{await auditEvent({kind:'tool_finished',tool:safeDiagnosticTool(call?.name),status:'invalid_tool_call',durationMs:0,diagnostics:toolDiagnostics({status:'invalid_tool_call',reason,stage:'local_validation',dispatched:false,proposalSequence,validation})});};
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
      const messages=[{role:'user',content:JSON.stringify({inputs,...(batchContext?{batchContext}:{})})}];
      const inputIds=inputs.map(row=>row.uuid);
      const callIds=new Set();
      let calls=0,stageCalls=0,stageRounds=0;
      const followupRounds=Math.min(10,config.followupRounds??10);
      const visibleDefinitions=()=>definitions.filter(def=>{const tool=tools.find(t=>t.name===def.name);return stage==='legacy'||!tool.phases||tool.phases.includes(stage);});
      settleCycle=async(followupStatus,handledIds=initialHandled)=>{
        const handledInputIds=[...new Set([...initialHandled,...handledIds])];
        if(!handledInputIds.length)return outcome({status:'round_limit',followupStatus,calls});
        await renew();await authorize();
        if(pipeline.finishCycle) {
          const checkpoint=await guarded(()=>pipeline.finishCycle({handledInputIds:[...handledInputIds],inputs:structuredClone(inputs),principal,signal:combined,leaseToken,executionLog:getExecutionLog(),followupStatus}));
          if(checkpoint?.status!=='ready')failure('preflight_failed');
        }
        await renew();await authorize();
        const result=await guarded(()=>store.finish({leaseToken,handledInputIds,signal:combined}));
        if(result.status!=='ready')failure('stale');
        leaseToken=null;
        return outcome({status:'completed',handled:handledInputIds.length,remaining:inputs.length-handledInputIds.length,calls,followupStatus});
      };
      const startFollowup=async handledInputIds=>{
        await renew();await authorize();
        initialHandled=[...handledInputIds];
        await recordExecution({kind:'initial_complete',handledInputIds:[...initialHandled]});
        const next=await guarded(()=>pipeline.afterInitial({handledInputIds:[...initialHandled],inputs:structuredClone(inputs),principal,signal:combined,leaseToken,executionLog:getExecutionLog()}));
        if(!plainObject(next)||next.status!=='ready'||next.inputIds!==undefined&&(!Array.isArray(next.inputIds)||next.inputIds.length>500||!next.inputIds.every(validUuid)))failure('preflight_failed');
        if(Buffer.byteLength(canonicalJson(next))>262144)failure('context_limit');
        await recordExecution({kind:'deterministic_result',stage:'deterministic',result:next});
        for(const id of next.inputIds||[])if(!inputIds.includes(id))inputIds.push(id);
        stage='followup';stageCalls=0;stageRounds=0;
        system=buildAutomationPrompt({timezone:config.timezone,now:now(),phase:'followup'});
        messages.push({role:'user',content:JSON.stringify({stage:'followup',context:next.context??null})});
        return next.followupRequired!==false;
      };
      if(pipeline){
        await guarded(()=>pipeline.beginCycle({leaseToken,inputs:structuredClone(inputs),principal,signal:combined,recordExecution,getExecutionLog}));
        await recordExecution({kind:'batch_context',inputs:structuredClone(inputs),...(batchContext?{batchContext}:{})});
      }
      for(let round=0;round<config.maxRounds+(pipeline?followupRounds:0);round++) {
        if(stage==='initial'&&stageRounds>=config.maxRounds&&!await startFollowup([]))return await settleCycle('not_needed');
        if(stage==='followup'&&stageRounds>=followupRounds)break;
        stageRounds++;
        await renew();await authorize();
        progressRound=round+1;progressCalls=calls;await progressStart('model');
        const turn=await guarded(()=>provider.toolTurn({system:system+driveSkillPrompt(driveSkillActive),messages:structuredClone(messages),tools:[...visibleDefinitions(),finishTool],maxToolCalls:AUTOMATION_MAX_TOOL_CALLS,signal:combined,auditContext:{...auditContext,round:round+1}}));
        await recordExecution({kind:'model_result',round:progressRound,result:turn??null});
        if (!plainObject(turn)||!Array.isArray(turn.toolCalls)||!turn.toolCalls.length||turn.toolCalls.length>AUTOMATION_MAX_TOOL_CALLS||!['tool_calls','tool_use'].includes(turn.stopReason)) failure('incomplete_batch');
        const turnIds=new Set();
        for(const call of turn.toolCalls) {
          proposalSequence++;
          if (!plainObject(call)||typeof call.id!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(call.id)||callIds.has(call.id)||turnIds.has(call.id)||!plainObject(call.arguments)) {await rejectProposal(call,'invalid_tool_call');failure('invalid_tool_call');}
          turnIds.add(call.id);
          const definition=call.name==='finish_batch'?finishTool:visibleDefinitions().find(t=>t.name===call.name);
          const emptyFinish=turn.toolCalls.length===1&&call.name==='finish_batch'&&Object.keys(call.arguments).length===1
            &&Array.isArray(call.arguments.handledInputIds)&&call.arguments.handledInputIds.length===0;
          if(!definition||!validateArguments(call.arguments,definition.parameters)&&!emptyFinish) {await rejectProposal(call,definition?'invalid_arguments':'unknown_tool',definition?argumentDiagnostic(call.arguments,definition.parameters):undefined);failure('invalid_tool_call');}
          if(call.name!=='finish_batch'&&(new Set(call.arguments.inputIds).size!==call.arguments.inputIds.length||!call.arguments.inputIds.every(id=>validUuid(id)&&inputIds.includes(id)))) {await rejectProposal(call,'invalid_input_scope',{keyword:'scope',field:'inputIds'});failure('invalid_tool_call');}
        }
        await progressDone('ready');
        // Validate first, then load the reviewed skill and ask for a fresh plan.
        // No action, receipt, call ID or tool budget is consumed by activation.
        if(!driveSkillActive&&turn.toolCalls.some(call=>isDriveTool(call.name))) {
          driveSkillActive=true;
          continue;
        }
        calls+=turn.toolCalls.length;stageCalls+=turn.toolCalls.length;progressCalls=calls;
        const stageLimit=stage==='followup'?(config.maxFollowupCalls??AUTOMATION_MAX_STAGE_CALLS):(config.maxCalls??AUTOMATION_MAX_STAGE_CALLS);
        if(stageCalls>stageLimit) {for(const call of turn.toolCalls)await rejectProposal(call,'call_limit');failure('call_limit');}
        for(const id of turnIds)callIds.add(id);
        const finish=turn.toolCalls.find(c=>c.name==='finish_batch');
        if(finish) {
          if(turn.toolCalls.length!==1) {await rejectProposal(finish,'invalid_completion');failure('invalid_completion');}
          const handledInputIds=finish.arguments.handledInputIds;
          if(new Set(handledInputIds).size!==handledInputIds.length||!handledInputIds.every(id=>validUuid(id)&&inputs.some(row=>row.uuid===id))) {await rejectProposal(finish,'invalid_completion_scope',{keyword:'scope',field:'handledInputIds'});failure('invalid_completion');}
          await progressStart('tool','finish_batch');
          await renew();await authorize();
          if(pipeline) {
            const response={status:'ready',stage,handledInputIds};
            messages.push({role:'assistant',content:typeof turn.text==='string'?turn.text:'',toolCalls:structuredClone(turn.toolCalls)},
              {role:'tool',toolCallId:finish.id,content:JSON.stringify(response)});
            await recordExecution({kind:'tool_result',tool:'finish_batch',result:response});
            await progressDone('ready');
            if(stage==='initial'){if(!await startFollowup(handledInputIds))return await settleCycle('not_needed');continue;}
            return await settleCycle('completed',handledInputIds);
          }
          let completion;
          if(validateCompletion!==undefined) {
            if(typeof validateCompletion!=='function')failure('not_configured');
            await markDispatched();
            completion=await guarded(()=>validateCompletion({handledInputIds,principal,signal:combined}));
            if(!plainObject(completion)||!['ready','pending'].includes(completion.status)||Buffer.byteLength(canonicalJson(completion))>16384)failure('invalid_completion');
          }
          if(handledInputIds.length===0||completion?.status==='pending') {
              const feedback=handledInputIds.length===0?{status:'pending',reason:'empty_handled_input_ids',queuedInputIds:[...inputIds],
                notice:'No inputs were completed. Perform remaining required work, then call finish_batch alone with the actual queued UUIDs you successfully handled. An empty array never completes the batch.',
                ...(completion?{completion:{status:completion.status},nextActions:Array.isArray(completion.nextActions)?completion.nextActions.slice(0,5):[]}:{nextActions:[]})}:completion;
              if(handledInputIds.length===0)while(Buffer.byteLength(canonicalJson(feedback))>16384&&feedback.nextActions.length)feedback.nextActions.pop();
              if(Buffer.byteLength(canonicalJson(feedback))>16384)failure('context_limit');
              messages.push({role:'assistant',content:'',toolCalls:structuredClone(turn.toolCalls)},
                {role:'tool',toolCallId:finish.id,content:JSON.stringify(feedback)});
              if(Buffer.byteLength(JSON.stringify(messages))>262144)failure('context_limit');
              activeProgress.result=feedback;
              await progressDone('pending');
              continue;
          }
          await markDispatched();
          const result=await guarded(()=>store.finish({leaseToken,handledInputIds,signal:combined}));
          if(result.status!=='ready') failure('stale');
          leaseToken=null;
          activeProgress.result={status:'completed'};
          await progressDone('completed');
          return outcome({status:'completed',handled:handledInputIds.length,remaining:inputs.length-handledInputIds.length,calls});
        }
        messages.push({role:'assistant',content:typeof turn.text==='string'?turn.text:'',toolCalls:structuredClone(turn.toolCalls)});
        for(const [proposalIndex,call] of turn.toolCalls.entries()) {
          await progressStart('tool',call.name);
          activeProgress.proposalSequence=proposalSequence-turn.toolCalls.length+proposalIndex+1;
          await renew();await authorize();
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
            const feedback={status:'tool_error',reason,message:'Tool call failed. No successful result was confirmed.'};
            activeProgress.result={status,diagnostics:{...diagnostics,reason}};
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
          const actionKey=createHash('sha256').update(canonicalJson({inputIds:scopedIds,name:call.name,arguments:executionArguments})).digest('hex');
          const receipt=tool.readOnly===true?{status:'execute'}:await guarded(()=>store.action({leaseToken,actionKey,signal:combined}));
          let result;
          if(receipt.status==='completed') result={status:'already_succeeded'};
          else {
            if(receipt.status!=='execute') failure('stale');
            await authorize();
            await markDispatched();
            try {result=await guarded(()=>tool.execute(executionArguments,{principal,inputIds:scopedIds,idempotencyKey:actionKey,signal:combined}));}
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
            if(!['ready','success','succeeded','completed','ok'].includes(resultStatus)) {
              // Tool-local stale/aborted outcomes do not cancel an active run.
              // Actual lease and whole-run state are checked independently.
              const statusReason=toolDiagnostics({status:resultStatus}).reason;
              await reportToolFailure({status:statusReason==='unknown'?'failed':resultStatus,result});continue;
            }
            if(tool.readOnly!==true) {
              const saved=await guarded(()=>store.action({leaseToken,actionKey,complete:true,signal:combined}));
              if(saved.status!=='completed') failure('stale');
            }
          }
          activeProgress.result=result;
          await recordExecution({kind:'tool_result',tool:call.name,callId:call.id,inputIds:scopedIds,arguments:structuredClone(executionArguments),result});
          messages.push({role:'tool',toolCallId:call.id,content:JSON.stringify(result)});
          await progressDone(result.status==='already_succeeded'?'already_succeeded':'ready');
        }
        if(Buffer.byteLength(JSON.stringify(messages))>262144) failure('context_limit');
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
