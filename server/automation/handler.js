import {toolDiagnostics,argumentDiagnostic,safeDiagnosticTool} from '../tool-diagnostics.js';
import {createHash,randomUUID} from 'node:crypto';
import {buildAutomationPrompt} from './prompt.js';
import {driveSkillPrompt,isDriveTool} from '../skills/drive.js';
import {canonicalJson,checkSchema,plainObject,validateArguments,validLabel,validSourceId,validUuid} from './validation.js';
const finishTool = {name:'finish_batch',description:'Complete only explicitly handled cache inputs after their required actions succeed; call alone.',parameters:{type:'object',properties:{handledInputIds:{type:'array',items:{type:'string'},minItems:1,maxItems:20}},required:['handledInputIds'],additionalProperties:false}};
const failure = code => { throw new Error(code); };
export function createAutomationHandler({store,provider,tools=[],authorizeEvent,authorizeEvents,prepareBatch,cleanupBatch,validateCompletion,principal,config,now=()=>new Date(),onProgress=()=>{},audit} = {}) {
  let running = false;
  let definitions;
  try {
    if (!Array.isArray(tools) || tools.length>24) throw new Error('invalid_tools');
    const names=new Set(['finish_batch']);
    definitions=tools.map(tool=>{
      if (!validLabel(tool.name)||names.has(tool.name)||tool.readOnly!==true&&tool.idempotent!==true||typeof tool.execute!=='function'||tool.prepareArguments!==undefined&&typeof tool.prepareArguments!=='function'||typeof tool.description!=='string'||tool.description.length>4000||tool.parameters?.type!=='object') throw new Error('invalid_tools');
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
    if(store.requiresScopedClaims===true&&(!Array.isArray(principal?.allowedSourceIds)||!principal.allowedSourceIds.length||principal.allowedSourceIds.length>500
      ||!principal.allowedSourceIds.every(validUuid)||new Set(principal.allowedSourceIds).size!==principal.allowedSourceIds.length))return {status:'not_configured'};
    running=true;
    const progressStarted=performance.now();
    let auditContext,runResult={status:'unavailable'},claimedCount=0,runError;
    const outcome=value=>{runResult=value;return value;};
    const auditEvent=async event=>{
      if(!auditContext)return;
      try{await audit?.recordEvent({eventId:randomUUID(),context:{...auditContext,round:progressRound},...event});}catch{/* Provider dispatch independently enforces durable call logging. */}
    };
    let progressCount=0,progressRound=0,progressCalls=0,activeProgress,proposalSequence=0;
    const registeredNames=new Set([...tools.map(tool=>tool.name),'finish_batch']);
    const emitProgress=(phase,status,tool)=>{
      if(typeof onProgress!=='function'||progressCount>=128)return;
      progressCount++;
      const event={phase,status,round:Math.min(16,progressRound),calls:Math.min(32,progressCalls),elapsedMs:Math.min(900000,Math.max(0,Math.round(performance.now()-progressStarted)))};
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
      const claim=await guarded(()=>store.claim({config,allowedSourceIds:principal?.allowedSourceIds?[...principal.allowedSourceIds]:undefined,signal:combined}));
      if (claim.status!=='ready') return {status:claim.status};
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
      const system=buildAutomationPrompt({timezone:config.timezone,now:now()});
      let driveSkillActive=false;
      const messages=[{role:'user',content:JSON.stringify({inputs,...(batchContext?{batchContext}:{})})}];
      const inputIds=inputs.map(row=>row.uuid);
      const callIds=new Set();
      let calls=0;
      for(let round=0;round<config.maxRounds;round++) {
        await renew();await authorize();
        progressRound=round+1;progressCalls=calls;await progressStart('model');
        const turn=await guarded(()=>provider.toolTurn({system:system+driveSkillPrompt(driveSkillActive),messages:structuredClone(messages),tools:[...definitions,finishTool],signal:combined,auditContext:{...auditContext,round:round+1}}));
        if (!plainObject(turn)||!Array.isArray(turn.toolCalls)||!turn.toolCalls.length||turn.toolCalls.length>8||!['tool_calls','tool_use'].includes(turn.stopReason)) failure('incomplete_batch');
        const turnIds=new Set();
        for(const call of turn.toolCalls) {
          proposalSequence++;
          if (!plainObject(call)||typeof call.id!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(call.id)||callIds.has(call.id)||turnIds.has(call.id)||!plainObject(call.arguments)) {await rejectProposal(call,'invalid_tool_call');failure('invalid_tool_call');}
          turnIds.add(call.id);
          const definition=call.name==='finish_batch'?finishTool:definitions.find(t=>t.name===call.name);
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
        calls+=turn.toolCalls.length;progressCalls=calls;if(calls>config.maxCalls) {for(const call of turn.toolCalls)await rejectProposal(call,'call_limit');failure('call_limit');}
        for(const id of turnIds)callIds.add(id);
        const finish=turn.toolCalls.find(c=>c.name==='finish_batch');
        if(finish) {
          if(turn.toolCalls.length!==1) {await rejectProposal(finish,'invalid_completion');failure('invalid_completion');}
          const handledInputIds=finish.arguments.handledInputIds;
          if(new Set(handledInputIds).size!==handledInputIds.length||!handledInputIds.every(id=>validUuid(id)&&inputIds.includes(id))) {await rejectProposal(finish,'invalid_completion_scope',{keyword:'scope',field:'handledInputIds'});failure('invalid_completion');}
          await progressStart('tool','finish_batch');
          await renew();await authorize();
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
          activeProgress.result=completion?.miroReconciliation?.status==='deferred'?{status:'completed',deferred:true}:{status:'completed'};
          await progressDone('completed');
          const miro=completion?.miroReconciliation;
          const deferred=miro?.status==='deferred'&&miro.syncComplete===false&&Array.isArray(miro.boardIds)&&miro.boardIds.length>=1&&miro.boardIds.length<=8
            ?{miroReconciliation:{status:'deferred',boardCount:miro.boardIds.length,syncComplete:false}}:{};
          return outcome({status:'completed',handled:handledInputIds.length,remaining:inputs.length-handledInputIds.length,calls,...deferred});
        }
        messages.push({role:'assistant',content:typeof turn.text==='string'?turn.text:'',toolCalls:structuredClone(turn.toolCalls)});
        for(const [proposalIndex,call] of turn.toolCalls.entries()) {
          await progressStart('tool',call.name);
          activeProgress.proposalSequence=proposalSequence-turn.toolCalls.length+proposalIndex+1;
          await renew();await authorize();
          const tool=tools.find(t=>t.name===call.name);
          const scopedIds=[...call.arguments.inputIds].sort();
          let executionArguments=structuredClone(call.arguments.arguments);
          if(tool.prepareArguments) {
            executionArguments=await guarded(()=>tool.prepareArguments(executionArguments,{principal,inputIds:scopedIds,signal:combined}));
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
            result=await guarded(()=>tool.execute(executionArguments,{principal,inputIds:scopedIds,idempotencyKey:actionKey,signal:combined}));
            activeProgress.result=result;
            if (!plainObject(result)||!['ready','success','succeeded','completed','ok',...(tool.readOnly===true?['invalid_request']:[])].includes(result.status)||Buffer.byteLength(canonicalJson(result))>16384) {
              await progressDone(plainObject(result)&&Buffer.byteLength(canonicalJson(result))>16384?'result_too_large':plainObject(result)&&typeof result.status==='string'?result.status:'invalid_result');
              failure('tool_failed');
            }
            if(tool.readOnly!==true) {
              const saved=await guarded(()=>store.action({leaseToken,actionKey,complete:true,signal:combined}));
              if(saved.status!=='completed') failure('stale');
            }
          }
          activeProgress.result=result;
          messages.push({role:'tool',toolCallId:call.id,content:JSON.stringify(result)});
          await progressDone(result.status==='already_succeeded'?'already_succeeded':result.status==='invalid_request'?'invalid_request':'ready');
        }
        if(Buffer.byteLength(JSON.stringify(messages))>262144) failure('context_limit');
      }
      return outcome({status:'round_limit'});
    } catch(e) {
      runError=e;
      await progressDone(e?.message==='aborted'?'aborted':e?.message==='forbidden'?'forbidden':'failed',e);
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
      await auditEvent({kind:'run_finished',status:runResult.status,diagnostics:toolDiagnostics({status:runResult.status,error:runError,reason:timedOut?'timeout':leaseLost?'stale':runError?.diagnostics?.reason??runResult.status,stage:runError?.diagnostics?.stage??'orchestration',dispatched:false}),durationMs:Math.round(performance.now()-progressStarted),counts:{inputs:claimedCount,handled:runResult.handled||0,remaining:runResult.remaining??claimedCount,calls:progressCalls,miroDeferred:runResult.miroReconciliation?.status==='deferred'?1:0,miroDeferredBoards:runResult.miroReconciliation?.boardCount||0}});
      running=false;
    }
  }};
}
