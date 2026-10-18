import {createHash} from 'node:crypto';
import {buildAutomationPrompt} from './prompt.js';
import {canonicalJson,checkSchema,plainObject,validateArguments,validLabel,validSourceId,validUuid} from './validation.js';
const finishTool = {name:'finish_batch',description:'Complete only explicitly handled cache inputs after their required actions succeed; call alone.',parameters:{type:'object',properties:{handledInputIds:{type:'array',items:{type:'string'},minItems:1,maxItems:20}},required:['handledInputIds'],additionalProperties:false}};
const failure = code => { throw new Error(code); };
export function createAutomationHandler({store,provider,tools=[],authorizeEvent,prepareBatch,cleanupBatch,principal,config,now=()=>new Date()} = {}) {
  let running = false;
  let definitions;
  try {
    if (!Array.isArray(tools) || tools.length>24) throw new Error('invalid_tools');
    const names=new Set(['finish_batch']);
    definitions=tools.map(tool=>{
      if (!validLabel(tool.name)||names.has(tool.name)||tool.readOnly!==true&&tool.idempotent!==true||typeof tool.execute!=='function'||typeof tool.description!=='string'||tool.description.length>4000||tool.parameters?.type!=='object') throw new Error('invalid_tools');
      checkSchema(tool.parameters);names.add(tool.name);
      return {name:tool.name,description:`${tool.readOnly===true?'Read-only context tool. ':'Idempotent action tool. '}${tool.description}`,parameters:{type:'object',properties:{
        inputIds:{type:'array',items:{type:'string'},minItems:1,maxItems:20},arguments:structuredClone(tool.parameters),
      },required:['inputIds','arguments'],additionalProperties:false}};
    });
  } catch { definitions=null; }
  return {async tick({signal}={}) {
    if (!config?.enabled) return {status:'disabled'};
    if (running) return {status:'busy'};
    if (!definitions || !tools.length || typeof authorizeEvent!=='function' || typeof provider?.toolTurn!=='function' || store?.configured===false) return {status:'not_configured'};
    running=true;
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
      const claim=await guarded(()=>store.claim({config,signal:combined}));
      if (claim.status!=='ready') return {status:claim.status};
      leaseToken=claim.leaseToken;
      const inputs=claim.inputs;
      if (!validUuid(leaseToken)||!Array.isArray(inputs)||!inputs.length||inputs.length>config.maxInputs||Buffer.byteLength(JSON.stringify(inputs))>config.maxBytes||new Set(inputs.map(r=>r.uuid)).size!==inputs.length) failure('invalid_batch');
      for (const row of inputs) {
        const e=row.raw_response;
        if (!validUuid(row.uuid)||!plainObject(e)||!validLabel(e.source)||!validSourceId(e.source_id)||!validLabel(e.event_type)||!validSourceId(e.event_id)||!validSourceId(e.revision)||!Number.isFinite(Date.parse(e.received_at))||!Object.hasOwn(e,'payload')) failure('invalid_batch');
      }
      const authorize=async()=>{
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
        batchContext=await guarded(()=>prepareBatch({inputs:structuredClone(inputs),principal,signal:combined}));
        if (!plainObject(batchContext)||batchContext.status!=='ready') failure('preflight_failed');
        if (Buffer.byteLength(canonicalJson(batchContext))>65536) failure('context_limit');
        await renew();await authorize();
      }
      const system=buildAutomationPrompt({timezone:config.timezone,now:now()});
      const messages=[{role:'user',content:JSON.stringify({inputs,...(batchContext?{batchContext}:{})})}];
      const inputIds=inputs.map(row=>row.uuid);
      const callIds=new Set();
      let calls=0;
      for(let round=0;round<config.maxRounds;round++) {
        await renew();await authorize();
        const turn=await guarded(()=>provider.toolTurn({system,messages:structuredClone(messages),tools:[...definitions,finishTool],signal:combined}));
        if (!plainObject(turn)||!Array.isArray(turn.toolCalls)||!turn.toolCalls.length||turn.toolCalls.length>8||!['tool_calls','tool_use'].includes(turn.stopReason)) failure('incomplete_batch');
        calls+=turn.toolCalls.length;if(calls>config.maxCalls) failure('call_limit');
        for(const call of turn.toolCalls) {
          if (!plainObject(call)||typeof call.id!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(call.id)||callIds.has(call.id)||!plainObject(call.arguments)) failure('invalid_tool_call');
          callIds.add(call.id);
          const definition=call.name==='finish_batch'?finishTool:definitions.find(t=>t.name===call.name);
          if(!definition||!validateArguments(call.arguments,definition.parameters)) failure('invalid_tool_call');
          if(call.name!=='finish_batch'&&(new Set(call.arguments.inputIds).size!==call.arguments.inputIds.length||!call.arguments.inputIds.every(id=>validUuid(id)&&inputIds.includes(id)))) failure('invalid_tool_call');
        }
        const finish=turn.toolCalls.find(c=>c.name==='finish_batch');
        if(finish) {
          if(turn.toolCalls.length!==1) failure('invalid_completion');
          const handledInputIds=finish.arguments.handledInputIds;
          if(new Set(handledInputIds).size!==handledInputIds.length||!handledInputIds.every(id=>validUuid(id)&&inputIds.includes(id))) failure('invalid_completion');
          await renew();await authorize();
          const result=await guarded(()=>store.finish({leaseToken,handledInputIds,signal:combined}));
          if(result.status!=='ready') failure('stale');
          leaseToken=null;
          return {status:'completed',handled:handledInputIds.length,remaining:inputs.length-handledInputIds.length,calls};
        }
        messages.push({role:'assistant',content:typeof turn.text==='string'?turn.text:'',toolCalls:structuredClone(turn.toolCalls)});
        for(const call of turn.toolCalls) {
          await renew();await authorize();
          const tool=tools.find(t=>t.name===call.name);
          const scopedIds=[...call.arguments.inputIds].sort();
          const actionKey=createHash('sha256').update(canonicalJson({inputIds:scopedIds,name:call.name,arguments:call.arguments.arguments})).digest('hex');
          const receipt=tool.readOnly===true?{status:'execute'}:await guarded(()=>store.action({leaseToken,actionKey,signal:combined}));
          let result;
          if(receipt.status==='completed') result={status:'already_succeeded'};
          else {
            if(receipt.status!=='execute') failure('stale');
            await authorize();
            result=await guarded(()=>tool.execute(structuredClone(call.arguments.arguments),{principal,inputIds:scopedIds,idempotencyKey:actionKey,signal:combined}));
            if (!plainObject(result)||!['ready','success','succeeded','completed','ok'].includes(result.status)||Buffer.byteLength(canonicalJson(result))>16384) failure('tool_failed');
            if(tool.readOnly!==true) {
              const saved=await guarded(()=>store.action({leaseToken,actionKey,complete:true,signal:combined}));
              if(saved.status!=='completed') failure('stale');
            }
          }
          messages.push({role:'tool',toolCallId:call.id,content:JSON.stringify(result)});
        }
        if(Buffer.byteLength(JSON.stringify(messages))>262144) failure('context_limit');
      }
      return {status:'round_limit'};
    } catch(e) {
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
