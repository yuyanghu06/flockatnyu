import {randomUUID} from 'node:crypto';
import {SUMMARY_FIELDS,summaryMessageIds,validateDiscordSummary} from './summary-provider.js';
import {chunkLiveSummaryEvidence} from './live-summary-utils.js';
const bytes=v=>Buffer.byteLength(JSON.stringify(v),'utf8');
const failure=code=>Object.assign(new Error(code),{code});
const requireReady=r=>{if(r?.status!=='ready')throw failure(r?.status||'unavailable');return r;};
export function liveSummaryMapInputs(messages) {
  return messages.flatMap(message=>{
    if(bytes(message)<=20000)return [message];
    // The entire canonical record is represented, including attachments/text
    // components. Fragment metadata retains one real original citation ID.
    const fragments=chunkLiveSummaryEvidence(message,6000);
    return fragments.map((evidenceJsonFragment,partIndex)=>({messageId:message.messageId,partIndex,partCount:fragments.length,evidenceJsonFragment}));
  });
}
const inputIds=input=>[...new Set(input.flatMap(x=>x.messageId?[x.messageId]:summaryMessageIds(x.summary||x)))];
export function packLiveSummaryInputs(inputs,maxBytes=49152) {
  const batches=[];let batch=[];
  for(const input of inputs) {
    if(bytes([input])>maxBytes)throw failure('coverage_limit');
    const candidate=[...batch,input];
    if(batch.length&&(bytes(candidate)>maxBytes||inputIds(candidate).length>512)){batches.push(batch);batch=[];}
    batch.push(input);
  }
  if(batch.length)batches.push(batch);return batches;
}
function reductionInputs(summaries) {
  // Keep each supported finding intact; pack findings across former map parts
  // so even one near-limit map output does not prevent hierarchical reduction.
  return summaries.flatMap(summary=>SUMMARY_FIELDS.flatMap(field=>summary[field].map(finding=>({summary:{...Object.fromEntries(SUMMARY_FIELDS.map(k=>[k,[]])),[field]:[finding]}}))));
}
function dispatchHooks({store,signal}) {
  return {
    beforeDispatch:async estimate=>store.reserveRequest({reservationId:randomUUID(),...estimate,signal}),
    // The interactive caller supplies a request-scoped in-memory budget.
    // Usage accounting never writes to Discord persistence.
    afterDispatch:async ({reservation,status,usage})=>store.commitUsage({reservationId:reservation.reservationId,status,usage}),
  };
}
export async function summarizeLiveDiscordEvidence({messages,config,provider,store,signal}={}) {
  if(!messages.length)return {status:'ready',summary:Object.fromEntries(SUMMARY_FIELDS.map(k=>[k,[]]))};
  const hooks=dispatchHooks({store,signal});let summaries=[];
  const invoke=async(stage,input)=>{
    if(signal?.aborted)throw failure('aborted');
    const allowedMessageIds=inputIds(input),r=requireReady(await provider.summarize({stage,input,allowedMessageIds,signal,...hooks}));
    const checked=validateDiscordSummary(r.summary,allowedMessageIds);requireReady(checked);return checked.summary;
  };
  for(const input of packLiveSummaryInputs(liveSummaryMapInputs(messages),config.maxInputBytes))summaries.push(await invoke('map',input));
  for(let level=0;summaries.length>1;level++) {
    if(level>=config.maxReduceLevels)throw failure('coverage_failed');
    const previousBytes=bytes(summaries),previousCount=summaries.length,next=[];
    const reduction=reductionInputs(summaries);
    if(!reduction.length)return {status:'ready',summary:Object.fromEntries(SUMMARY_FIELDS.map(k=>[k,[]]))};
    for(const input of packLiveSummaryInputs(reduction,config.maxInputBytes))next.push(await invoke('reduce',input));
    if(next.length>=previousCount&&bytes(next)>=previousBytes)throw failure('coverage_failed');
    summaries=next;
  }
  return {status:'ready',summary:summaries[0]};
}
