import {createHash} from 'node:crypto';
import {buildAutomationPrompt} from './prompt.js';
import {canonicalJson,checkSchema,plainObject,validateArguments,validLabel,validSourceId,validUuid} from './validation.js';
const finishTool = {name:'finish_batch',description:'Complete only explicitly handled cache inputs after their required actions succeed; call alone.',parameters:{type:'object',properties:{handledInputIds:{type:'array',items:{type:'string'},minItems:1,maxItems:20}},required:['handledInputIds'],additionalProperties:false}};
const failure = code => { throw new Error(code); };
export function createAutomationHandler({store,provider,tools=[],authorizeEvent,authorizeEvents,prepareBatch,cleanupBatch,validateCompletion,principal,config,now=()=>new Date(),onProgress=()=>{}} = {}) {
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
    let progressCount=0,progressRound=0,progressCalls=0,activeProgress;
    const registeredNames=new Set([...tools.map(tool=>tool.name),'finish_batch']);
    const emitProgress=(phase,status,tool)=>{
      if(typeof onProgress!=='function'||progressCount>=128)return;
      progressCount++;
      const event={phase,status,round:Math.min(16,progressRound),calls:Math.min(32,progressCalls),elapsedMs:Math.min(900000,Math.max(0,Math.round(performance.now()-progressStarted)))};
      if(registeredNames.has(tool))event.tool=tool;
      try{Promise.resolve(onProgress(Object.freeze(event))).catch(()=>{});}catch{/* Diagnostics never change execution. */}
    };
    const progressStart=(phase,tool)=>{activeProgress={phase,tool};emitProgress(`${phase}_start`,'started',tool);};
    const progressDone=status=>{if(!activeProgress)return;const {phase,tool}=activeProgress;activeProgress=undefined;emitProgress(`${phase}_done`,status,tool);};
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),config.maxRunMs);timeout.unref?.();
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
        renew().catch(()=>controller.abort()).finally(()=>{heartbeatBusy=false;});
      },20000);heartbeat.unref?.();
      await authorize();
      // Trusted adapters run only for an authorized, leased processing batch.
      // Their returned source context stays in the untrusted user message.
      let batchContext;
      if (prepareBatch !== undefined) {
        if (typeof prepareBatch !== 'function') failure('not_configured');
        progressStart('prepare');
        batchContext=await guarded(()=>prepareBatch({inputs:structuredClone(inputs),principal,signal:combined}));
        if (!plainObject(batchContext)||batchContext.status!=='ready') failure('preflight_failed');
        if (Buffer.byteLength(canonicalJson(batchContext))>65536) failure('context_limit');
        await renew();await authorize();
        progressDone('ready');
      }
      const system=buildAutomationPrompt({timezone:config.timezone,now:now()});
      const messages=[{role:'user',content:JSON.stringify({inputs,...(batchContext?{batchContext}:{})})}];
      const inputIds=inputs.map(row=>row.uuid);
      const callIds=new Set();
      let calls=0;
      for(let round=0;round<config.maxRounds;round++) {
        await renew();await authorize();
        progressRound=round+1;progressCalls=calls;progressStart('model');
        const turn=await guarded(()=>provider.toolTurn({system,messages:structuredClone(messages),tools:[...definitions,finishTool],signal:combined}));
        if (!plainObject(turn)||!Array.isArray(turn.toolCalls)||!turn.toolCalls.length||turn.toolCalls.length>8||!['tool_calls','tool_use'].includes(turn.stopReason)) failure('incomplete_batch');
        calls+=turn.toolCalls.length;progressCalls=calls;if(calls>config.maxCalls) failure('call_limit');
        for(const call of turn.toolCalls) {
          if (!plainObject(call)||typeof call.id!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(call.id)||callIds.has(call.id)||!plainObject(call.arguments)) failure('invalid_tool_call');
          callIds.add(call.id);
          const definition=call.name==='finish_batch'?finishTool:definitions.find(t=>t.name===call.name);
          const emptyFinish=turn.toolCalls.length===1&&call.name==='finish_batch'&&Object.keys(call.arguments).length===1
            &&Array.isArray(call.arguments.handledInputIds)&&call.arguments.handledInputIds.length===0;
          if(!definition||!validateArguments(call.arguments,definition.parameters)&&!emptyFinish) failure('invalid_tool_call');
          if(call.name!=='finish_batch'&&(new Set(call.arguments.inputIds).size!==call.arguments.inputIds.length||!call.arguments.inputIds.every(id=>validUuid(id)&&inputIds.includes(id)))) failure('invalid_tool_call');
        }
        progressDone('ready');
        const finish=turn.toolCalls.find(c=>c.name==='finish_batch');
        if(finish) {
          if(turn.toolCalls.length!==1) failure('invalid_completion');
          const handledInputIds=finish.arguments.handledInputIds;
          if(new Set(handledInputIds).size!==handledInputIds.length||!handledInputIds.every(id=>validUuid(id)&&inputIds.includes(id))) failure('invalid_completion');
          progressStart('tool','finish_batch');
          await renew();await authorize();
          let completion;
          if(validateCompletion!==undefined) {
            if(typeof validateCompletion!=='function')failure('not_configured');
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
              progressDone('pending');
              continue;
          }
          const result=await guarded(()=>store.finish({leaseToken,handledInputIds,signal:combined}));
          if(result.status!=='ready') failure('stale');
          leaseToken=null;
          progressDone('completed');
          const miro=completion?.miroReconciliation;
          const deferred=miro?.status==='deferred'&&miro.syncComplete===false&&Array.isArray(miro.boardIds)&&miro.boardIds.length>=1&&miro.boardIds.length<=8
            ?{miroReconciliation:{status:'deferred',boardCount:miro.boardIds.length,syncComplete:false}}:{};
          return {status:'completed',handled:handledInputIds.length,remaining:inputs.length-handledInputIds.length,calls,...deferred};
        }
        messages.push({role:'assistant',content:typeof turn.text==='string'?turn.text:'',toolCalls:structuredClone(turn.toolCalls)});
        for(const call of turn.toolCalls) {
          progressStart('tool',call.name);
          await renew();await authorize();
          const tool=tools.find(t=>t.name===call.name);
          const scopedIds=[...call.arguments.inputIds].sort();
          let executionArguments=structuredClone(call.arguments.arguments);
          if(tool.prepareArguments) {
            executionArguments=await guarded(()=>tool.prepareArguments(executionArguments,{principal,inputIds:scopedIds,signal:combined}));
            if(!validateArguments(executionArguments,tool.parameters))failure('invalid_tool_call');
          }
          const actionKey=createHash('sha256').update(canonicalJson({inputIds:scopedIds,name:call.name,arguments:executionArguments})).digest('hex');
          const receipt=tool.readOnly===true?{status:'execute'}:await guarded(()=>store.action({leaseToken,actionKey,signal:combined}));
          let result;
          if(receipt.status==='completed') result={status:'already_succeeded'};
          else {
            if(receipt.status!=='execute') failure('stale');
            await authorize();
            result=await guarded(()=>tool.execute(executionArguments,{principal,inputIds:scopedIds,idempotencyKey:actionKey,signal:combined}));
            if (!plainObject(result)||!['ready','success','succeeded','completed','ok',...(tool.readOnly===true?['invalid_request']:[])].includes(result.status)||Buffer.byteLength(canonicalJson(result))>16384) failure('tool_failed');
            if(tool.readOnly!==true) {
              const saved=await guarded(()=>store.action({leaseToken,actionKey,complete:true,signal:combined}));
              if(saved.status!=='completed') failure('stale');
            }
          }
          messages.push({role:'tool',toolCallId:call.id,content:JSON.stringify(result)});
          progressDone(result.status==='already_succeeded'?'already_succeeded':result.status==='invalid_request'?'invalid_request':'ready');
        }
        if(Buffer.byteLength(JSON.stringify(messages))>262144) failure('context_limit');
      }
      return {status:'round_limit'};
    } catch(e) {
      progressDone(e?.message==='aborted'?'aborted':e?.message==='forbidden'?'forbidden':'failed');
      const allowed=new Set(['aborted','forbidden','stale','invalid_batch','incomplete_batch','call_limit','invalid_tool_call','invalid_completion','tool_failed','context_limit','preflight_failed','not_configured']);
      return {status:allowed.has(e?.message)?e.message:'unavailable'};
    } finally {
      clearTimeout(timeout);clearInterval(heartbeat);
      if(leaseToken) { try { await store.release({leaseToken,signal:AbortSignal.timeout(15000)}); } catch { /* Expiring durable lease recovers after failures. */ } }
      try { cleanupBatch?.()?.catch?.(()=>{}); } catch { /* Cleanup cannot change the leased outcome. */ }
      running=false;
    }
  }};
}
