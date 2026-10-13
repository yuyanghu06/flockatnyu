import {createHash,randomUUID} from 'node:crypto';
import {createDiscordSummaryProvider,validateDiscordSummary,summaryMessageIds,canonicalDiscordSummaryJson,MAX_SUMMARY_CITATIONS} from './summary-provider.js';
import {getDiscordSummarySchedule} from './summary-schedule.js';

const bytes = value => Buffer.byteLength(JSON.stringify(value),'utf8');
const hash = value => createHash('sha256').update(canonicalDiscordSummaryJson(value)).digest('hex');
const snowflake = value => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const codes = new Set(['not_configured','invalid_request','aborted','partial','wait_for_sync','planning_required','budget_exhausted','runtime_limit','stalled','source_changed','forbidden','paused','stale','lease_lost','rate_limited','provider_unavailable','provider_auth_failed','provider_refusal','provider_incomplete','invalid_summary','foreign_citation','output_too_large','usage_unavailable','reservation_failed','usage_commit_failed','coverage_failed','database_unavailable']);
const safe = code => codes.has(code) ? code : 'database_unavailable';
const fail = code => {throw Object.assign(new Error(safe(code)),{code:safe(code)});};
const expect = result => {if(result?.status!=='ready') fail(result?.status);return result;};
const operationStale = op => op?.planningStale===true||Number(op?.stale??0)>0;
function summaryContext(job) {
  const channelName=job.channelName??job.title;
  return {guildId:job.guildId,channelId:job.channelId,
    ...(uuid(job.sourceId)?{sourceId:job.sourceId}:{}),
    ...(typeof channelName==='string'&&channelName.trim()?{channelName:channelName.slice(0,300)}:{}),
    tier:job.tier,periodStart:job.periodStart,periodEnd:job.periodEnd};
}

/** Store supplies immutable canonical originals and server-derived segments.
 * We pack exact segment text without trimming, truncation or outside fetching. */
export async function* discordSummaryChunks({store,job,signal,maxInputBytes=49152}) {
  let after=null,done=false,chunk=[],seenRecords=0,represented=0,seenSegments=0,previousOrder=null;
  const seen=new Set();
  const context=summaryContext(job);
  const envelope = records => ({context,records});
  const packed=records=>({input:envelope(records.map(({citationMessageIds,...item})=>item)),coverage:records.map(({text,citationMessageIds,...item})=>item),allowedMessageIds:[...new Set(records.flatMap(item=>item.citationMessageIds))]});
  while(!done) {
    if(signal?.aborted)fail('aborted');
    const page=expect(await store.getInputs({jobId:job.jobId,leaseToken:job.leaseToken,after,messageLimit:64,charLimit:18000,signal}));
    const records=page.records??page.messages;
    if(!Array.isArray(records)||typeof page.done!=='boolean')fail('coverage_failed');
    if(!records.length&&!page.done)fail('stalled');
    for(const record of records) {
      const kind=record.kind??'raw',inputId=record.inputId??record.messageId;
      const citationMessageIds=record.citationMessageIds??(kind==='raw'?[record.messageId??inputId]:[]);
      const representedCount=record.representedMessageCount??(kind==='raw'?1:null);
      if(!['raw','verified_summary'].includes(kind)||typeof inputId!=='string'||!inputId||inputId.length>128||seen.has(inputId)||record.guildId!=null&&record.guildId!==job.guildId||record.channelId!=null&&record.channelId!==job.channelId||!Array.isArray(record.segments)||!record.segments.length||!Array.isArray(citationMessageIds)||!citationMessageIds.every(snowflake)||!Number.isSafeInteger(representedCount)||representedCount<1)fail('coverage_failed');
      if(kind==='raw'&&(!snowflake(inputId)||representedCount!==1||citationMessageIds.length!==1||citationMessageIds[0]!==inputId))fail('coverage_failed');
      if(kind==='verified_summary'&&(!record.certificate||record.certificate.verified!==true||record.certificate.sourceId!==job.sourceId||record.certificate.representedMessageCount!==representedCount||typeof record.certificate.inputFingerprint!=='string'))fail('coverage_failed');
      if(new Set(citationMessageIds).size>MAX_SUMMARY_CITATIONS)fail('output_too_large');
      const order=Date.parse(kind==='verified_summary'?record.rangeStart??record.createdAt:record.createdAt);
      if(!Number.isFinite(order)||previousOrder!=null&&order<previousOrder)fail('coverage_failed');
      previousOrder=order;seen.add(inputId);seenRecords++;represented+=representedCount;
      for(let index=0;index<record.segments.length;index++) {
        const segment=record.segments[index];
        if(segment.segmentIndex!==index||segment.segmentCount!==record.segments.length||typeof segment.text!=='string'||!segment.text.length)fail('coverage_failed');
        const item={inputId,kind,segmentIndex:index,segmentCount:segment.segmentCount,text:segment.text,citationMessageIds};
        if(bytes(packed([item]).input)>maxInputBytes)fail('coverage_failed');
        if(chunk.length&&(bytes(packed([...chunk,item]).input)>maxInputBytes||packed([...chunk,item]).allowedMessageIds.length>MAX_SUMMARY_CITATIONS)){yield packed(chunk);chunk=[];}
        chunk.push(item);seenSegments++;
      }
    }
    done=page.done;
    if(!done&&(page.nextCursor==null||JSON.stringify(page.nextCursor)===JSON.stringify(after)))fail('stalled');
    after=page.nextCursor;
  }
  if(seenRecords!==(job.inputRecordCount??job.messageCount)||represented!==(job.representedMessageCount??job.messageCount)||seenSegments!==job.segmentCount)fail('coverage_failed');
  if(chunk.length)yield packed(chunk);
}

function partRef(part){return {stage:part.stage,ordinal:part.ordinal,inputHash:part.inputHash};}
// RPCs may reorder coverage rows and DAG edges; their membership is unordered.
// Preserve duplicates here so a changed multiplicity still fails validation.
function canonicalMembership(items){
  return JSON.stringify(items.map(canonicalDiscordSummaryJson).sort());
}
function finalSummary(summary,job){
  return {...summary,citations:summaryMessageIds(summary).map(messageId=>({messageId,url:`https://discord.com/channels/${job.guildId}/${job.channelId}/${messageId}`}))};
}

export async function runDiscordSummaries({config,store,provider=createDiscordSummaryProvider({config}),operationId,mode='bootstrap',asOf,dueIdentity,signal,now=()=>Date.now(),maxGroups=config?.maxGroups,maxRequests=config?.maxRequests,maxRuntimeMs=config?.maxRuntimeMs}={}) {
  const result={status:'not_configured',exitCode:1,complete:false,replans:0,plannedGroups:0,planningSteps:0,planningCursor:null,planningTotal:null,planningComplete:null,planningStale:null,groups:0,processedRecords:0,representedOriginals:0,mapParts:0,reduceParts:0,cachedParts:0,requests:0,inputTokens:0,outputTokens:0,cachedInputTokens:0,costUsd:0,reservedCostUsd:0,errors:[]};
  if(signal?.aborted)return {...result,status:'aborted'};
  if(!config?.configured||!store?.configured||provider?.configured===false)return result;
  if(!snowflake(config.guildId)||!['bootstrap','weekly','monthly','scheduled'].includes(mode)||!Number.isInteger(maxGroups)||maxGroups<1||!Number.isInteger(maxRequests)||maxRequests<1||!Number.isInteger(maxRuntimeMs)||maxRuntimeMs<1||operationId!=null&&!uuid(operationId))return {...result,status:'invalid_request'};
  const timeout=AbortSignal.timeout(maxRuntimeMs),combined=signal?AbortSignal.any([signal,timeout]):timeout;
  const ownerId=randomUUID();let claimed=0,stop=false;
  try {
    const schedule=getDiscordSummarySchedule({now:asOf??now,mode});
    if(schedule.status==='invalid_request')fail('invalid_request');
    if(mode==='scheduled'&&typeof store.getPendingOperation!=='function'&&!operationId)fail('database_unavailable');
    if(!operationId&&typeof store.getPendingOperation==='function') {
      const pendingMode=mode==='scheduled'?schedule.status==='due'?schedule.mode:undefined:mode;
      const pending=await store.getPendingOperation({guildId:config.guildId,provider:config.provider,model:config.model,promptVersion:config.promptVersion,...(pendingMode?{mode:pendingMode}:{}),signal:combined});
      if(pending.status==='ready'){operationId=pending.operationId??pending.operation?.operationId;if(!uuid(operationId))fail('database_unavailable');}
      else if(pending.status!=='empty')fail(pending.status);
    }
    if(!operationId&&schedule.status==='not_due')return {...result,status:'not_due',exitCode:0,complete:true};
    const plan=operationId?{}:{mode:schedule.mode,asOf:schedule.asOf,dueIdentity:dueIdentity??schedule.dueIdentity};
    if(!operationId) {
      const preview=expect(await store.preview({guildId:config.guildId,provider:config.provider,model:config.model,promptVersion:config.promptVersion,...plan,signal:combined}));
      const revision=preview.preview?.policyRevision??preview.policyRevision;
      if(!Number.isSafeInteger(revision))fail('database_unavailable');
      const started=await store.beginOperation({guildId:config.guildId,expectedPolicyRevision:revision,provider:config.provider,model:config.model,promptVersion:config.promptVersion,maxCostUsd:config.maxOperationCostUsd,maxRequests:config.maxOperationRequests,...plan,signal:combined});
      if(started.status==='wait_for_sync')return {...result,status:'partial',code:'wait_for_sync',waitingSourceCount:started.waitingSourceCount??0,blockedGroupCount:started.blockedGroupCount??0};
      expect(started);
      operationId=started.operationId??started.operation?.operationId;
      if(!uuid(operationId))fail('database_unavailable');
    }
    result.operationId=operationId;
    const operation=expect(await store.getOperation({operationId,signal:combined}));
    let identity=operation.operation??operation;
    if(identity.guildId!==config.guildId||identity.model!==config.model||identity.provider!==config.provider||identity.promptVersion!==config.promptVersion)fail('invalid_request');
    if(identity.mode!=null&&!['bootstrap','weekly','monthly'].includes(identity.mode))fail('invalid_request');
    if(identity.mode!=null&&mode!=='scheduled'&&identity.mode!==mode)fail('invalid_request');
    function observePlanning(op) {
      if(op.planningComplete!==undefined&&typeof op.planningComplete!=='boolean')fail('database_unavailable');
      result.planningComplete=op.planningComplete!==false;
      result.planningStale=operationStale(op);
      result.planningCursor=op.planningCursor??null;result.planningTotal=op.planningTotal??null;
      if(!result.planningComplete&&(!Number.isSafeInteger(result.planningCursor)||result.planningCursor<0||!Number.isSafeInteger(result.planningTotal)||result.planningTotal<result.planningCursor))fail('database_unavailable');
    }
    async function recover(op) {
      if(result.replans>=2)fail('stale');
      if(!['bootstrap','weekly','monthly'].includes(op.mode)||typeof op.asOf!=='string'||!Number.isFinite(Date.parse(op.asOf))||typeof op.dueIdentity!=='string'||!op.dueIdentity||!Number.isFinite(op.maxCostUsd)||op.maxCostUsd<=0||op.maxCostUsd>5||!Number.isSafeInteger(op.maxRequests)||op.maxRequests<1||op.maxRequests>10000||!Number.isSafeInteger(op.requests)||op.requests<0||!Number.isFinite(op.costUsd)||op.costUsd<0||!Number.isFinite(op.allocatedUsd)||op.allocatedUsd<0)fail('database_unavailable');
      const frozen={guildId:op.guildId,provider:op.provider,model:op.model,promptVersion:op.promptVersion,mode:op.mode,asOf:op.asOf,dueIdentity:op.dueIdentity};
      const preview=expect(await store.preview({...frozen,signal:combined}));
      const revision=preview.preview?.policyRevision??preview.policyRevision;
      if(!Number.isSafeInteger(revision))fail('database_unavailable');
      const repaired=await store.beginOperation({...frozen,expectedPolicyRevision:revision,maxCostUsd:op.maxCostUsd,maxRequests:op.maxRequests,signal:combined});
      if(repaired.status==='wait_for_sync')fail('wait_for_sync');
      expect(repaired);
      const next=repaired.operation;
      const nextId=repaired.operationId??next?.operationId;
      const charged=op.requests>0||op.costUsd>0||op.allocatedUsd>0;
      if(!next||!uuid(nextId)||charged&&nextId!==operationId||next.guildId!==op.guildId||next.provider!==op.provider||next.model!==op.model||next.promptVersion!==op.promptVersion||next.mode!==op.mode||next.asOf!==op.asOf||next.dueIdentity!==op.dueIdentity||next.maxCostUsd!==op.maxCostUsd||next.maxRequests!==op.maxRequests||charged&&(!Number.isSafeInteger(next.requests)||next.requests<op.requests))fail('database_unavailable');
      operationId=nextId;result.operationId=nextId;result.replans++;observePlanning(next);
      if(operationStale(next))fail('stale');
      return next;
    }
    observePlanning(identity);
    if(operationStale(identity))identity=await recover(identity);
    let staleReads=0;
    // Draft planning is durable and contains no paid dispatch. Each RPC freezes
    // exactly one queued source/period under the operation's original asOf.
    while(!result.planningComplete) {
      if(combined.aborted)return {...result,status:signal?.aborted?'aborted':'partial',code:signal?.aborted?'aborted':'runtime_limit'};
      if(typeof store.prepareOperation!=='function')fail('database_unavailable');
      const before=result.planningCursor;
      const prepared=await store.prepareOperation({operationId,expectedCursor:before,signal:combined});
      let next;
      if(prepared.status==='stale') {
        const current=expect(await store.getOperation({operationId,signal:combined}));next=current.operation??current;
      } else {expect(prepared);next=prepared.operation;}
      if(!next||typeof next.planningComplete!=='boolean'||next.operationId!=null&&next.operationId!==operationId||next.guildId!==config.guildId||next.model!==config.model||next.provider!==config.provider||next.promptVersion!==config.promptVersion||identity.mode!=null&&next.mode!==identity.mode||identity.asOf!=null&&next.asOf!==identity.asOf||identity.dueIdentity!=null&&next.dueIdentity!==identity.dueIdentity)fail('database_unavailable');
      if(operationStale(next)){identity=await recover(next);staleReads=0;continue;}
      observePlanning(next);
      if(result.planningCursor!=null&&result.planningCursor<before)fail('stalled');
      result.planningSteps+=Math.max(0,(result.planningCursor??before)-before);
      if(result.planningCursor===before&&!result.planningComplete) {
        if(prepared.status!=='stale'||++staleReads>=3)fail('stalled');
      } else staleReads=0;
      if(prepared.status==='ready') {
        if(prepared.plannedGroups!=null&&(!Number.isSafeInteger(prepared.plannedGroups)||prepared.plannedGroups<0||prepared.plannedGroups>1))fail('database_unavailable');
        result.plannedGroups+=prepared.plannedGroups??Math.min(1,Math.max(0,(result.planningCursor??before)-before));
      }
      identity=next;
    }
    if(combined.aborted)return {...result,status:signal?.aborted?'aborted':'partial',code:signal?.aborted?'aborted':'runtime_limit'};
    if(identity.complete===true)return {...result,status:'ready',exitCode:0,complete:true,operationRequests:identity.requests??null,operationCostUsd:identity.costUsd??null};
    async function checkPaidGate() {
      const loaded=expect(await store.getOperation({operationId,signal:combined})),op=loaded.operation??loaded;
      if(op.guildId!==config.guildId||op.model!==config.model||op.provider!==config.provider||op.promptVersion!==config.promptVersion)fail('database_unavailable');
      observePlanning(op);
      if(operationStale(op))fail('stale');
      if(!result.planningComplete)fail('planning_required');
    }
    async function execute(job) {
      const inputRecordCount=job.inputRecordCount??job.messageCount,representedMessageCount=job.representedMessageCount??job.messageCount;
      if(!uuid(job.jobId)||!snowflake(job.guildId)||job.guildId!==config.guildId||!snowflake(job.channelId)||!['weekly','monthly'].includes(job.tier)||!job.leaseToken||!Number.isSafeInteger(inputRecordCount)||inputRecordCount<1||!Number.isSafeInteger(representedMessageCount)||representedMessageCount<inputRecordCount||!Number.isSafeInteger(job.segmentCount)||job.segmentCount<inputRecordCount||typeof job.inputFingerprint!=='string')fail('coverage_failed');
      const listed=expect(await store.getParts({jobId:job.jobId,leaseToken:job.leaseToken,signal:combined}));
      if(!Array.isArray(listed.parts))fail('database_unavailable');
      const cache=new Map(listed.parts.map(part=>[`${part.stage}:${part.ordinal}:${part.inputHash}`,part]));
      let mapOrdinal=0,reduceOrdinal=0;
      async function summarize(stage,input,coverage,childParts,ordinal,mapCitationIds) {
        if(combined.aborted)fail('aborted');
        const inputHash=hash({promptVersion:config.promptVersion,provider:config.provider,model:config.model,stage,input});
        const allowedMessageIds=stage==='map'?mapCitationIds:[...new Set(childParts.flatMap(part=>summaryMessageIds(part.summary)))];
        if(new Set(allowedMessageIds).size>MAX_SUMMARY_CITATIONS)fail('output_too_large');
        const cached=cache.get(`${stage}:${ordinal}:${inputHash}`);
        if(cached) {
          if(canonicalMembership(cached.coverage??[])!==canonicalMembership(coverage)||canonicalMembership(cached.childParts??[])!==canonicalMembership(childParts.map(partRef)))fail('coverage_failed');
          if(bytes(cached.summary)>config.maxOutputBytes)fail('output_too_large');
          if(validateDiscordSummary(cached.summary,allowedMessageIds).status!=='ready')fail('invalid_summary');
          result.cachedParts++;return {...cached,stage,ordinal,inputHash};
        }
        let lastReservationId;
        const encoded=await provider.summarize({stage,input,allowedMessageIds,signal:combined,
          beforeDispatch:async estimate=>{
            if(combined.aborted)return {status:'aborted'};
            try {await checkPaidGate();} catch {stop=true;return {status:'reservation_failed'};}
            if(stop||result.requests>=maxRequests||result.reservedCostUsd+estimate.maxCostUsd>config.maxRunCostUsd){stop=true;return {status:'budget_exhausted'};}
            result.requests++;result.reservedCostUsd+=estimate.maxCostUsd;
            const reservationId=randomUUID();
            if(typeof store.renewJob==='function')expect(await store.renewJob({jobId:job.jobId,leaseToken:job.leaseToken,leaseSeconds:300,signal:combined}));
            const reserved=await store.reserveRequest({jobId:job.jobId,leaseToken:job.leaseToken,reservationId,maxCostUsd:estimate.maxCostUsd,inputTokens:estimate.inputTokens,outputTokens:estimate.outputTokens,signal:combined});
            if(reserved.status!=='ready'||reserved.reservation?.dispatchAllowed===false||reserved.dispatchAllowed===false){result.requests--;result.reservedCostUsd-=estimate.maxCostUsd;stop=true;return {status:reserved.status==='ready'?'reservation_failed':safe(reserved.status)};}
            lastReservationId=reservationId;return {...reserved,status:'ready',reservationId};
          },afterDispatch:async ({reservation,status,usage})=>{
            // Record actual/unknown dispatch spend even after SIGTERM/timeout.
            const saved=await store.commitUsage({reservationId:reservation.reservationId,status,usage});
            if(saved.status==='ready'&&usage){result.inputTokens+=usage.inputTokens;result.outputTokens+=usage.outputTokens;result.cachedInputTokens+=usage.cachedInputTokens??0;result.costUsd+=usage.costUsd;}
            return saved;
          }});
        if(encoded.status!=='ready')fail(encoded.status);
        const reservationId=encoded.reservationId??lastReservationId;
        if(!uuid(reservationId))fail('reservation_failed');
        if(bytes(encoded.summary)>config.maxOutputBytes)fail('output_too_large');
        if(validateDiscordSummary(encoded.summary,allowedMessageIds).status!=='ready')fail('invalid_summary');
        const part={stage,ordinal,inputHash,reservationId,inputMessageIds:allowedMessageIds,coverage,childParts:childParts.map(partRef),summary:encoded.summary};
        expect(await store.savePart({jobId:job.jobId,leaseToken:job.leaseToken,part,signal:combined}));
        if(stage==='map')result.mapParts++;else result.reduceParts++;
        cache.set(`${stage}:${ordinal}:${inputHash}`,part);return part;
      }
      let layer=[];
      for await(const chunk of discordSummaryChunks({store,job,signal:combined,maxInputBytes:config.maxInputBytes})) {
        layer.push(await summarize('map',chunk.input,chunk.coverage,[],mapOrdinal++,chunk.allowedMessageIds));
      }
      if(!layer.length)fail('coverage_failed');
      let depth=0;
      while(layer.length>1) {
        if(depth++>20)fail('stalled');
        const next=[];let batch=[];
        const input=parts=>({context:summaryContext(job),parts:parts.map(part=>({summary:part.summary}))});
        for(const part of layer) {
          if(bytes(input([part]))>config.maxInputBytes||summaryMessageIds(part.summary).length>MAX_SUMMARY_CITATIONS)fail('output_too_large');
          const candidate=[...batch,part];
          const citationCount=new Set(candidate.flatMap(child=>summaryMessageIds(child.summary))).size;
          if(batch.length&&(batch.length>=64||bytes(input(candidate))>config.maxInputBytes||citationCount>MAX_SUMMARY_CITATIONS)) {
            // A single valid child can be condensed before the next merge when
            // two children jointly exceed the decoder's citation limit. Its
            // complete input coverage remains represented by the child DAG.
            next.push(await summarize('reduce',input(batch),[],batch,reduceOrdinal++));batch=[];
          }
          batch.push(part);
        }
        if(batch.length)next.push(batch.length===1?batch[0]:await summarize('reduce',input(batch),[],batch,reduceOrdinal++));
        const oldCitations=new Set(layer.flatMap(part=>summaryMessageIds(part.summary))).size;
        const nextCitations=new Set(next.flatMap(part=>summaryMessageIds(part.summary))).size;
        const oldBytes=layer.reduce((sum,part)=>sum+bytes(part.summary),0),nextBytes=next.reduce((sum,part)=>sum+bytes(part.summary),0);
        if(next.length>=layer.length&&nextCitations>=oldCitations&&nextBytes>=oldBytes)fail('stalled');
        layer=next;
      }
      expect(await store.finishJob({jobId:job.jobId,leaseToken:job.leaseToken,summary:finalSummary(layer[0].summary,job),
        coverage:{inputRecordCount,representedMessageCount,segmentCount:job.segmentCount,inputFingerprint:job.inputFingerprint,mapPartCount:mapOrdinal},partCount:mapOrdinal+reduceOrdinal,finalPart:partRef(layer[0]),signal:combined}));
      result.groups++;result.processedRecords+=inputRecordCount;result.representedOriginals+=representedMessageCount;
    }
    async function worker() {
      while(!stop&&!combined.aborted&&claimed<maxGroups) {
        claimed++;
        try {await checkPaidGate();} catch(error){stop=true;result.errors.push({code:safe(error?.code)});return;}
        const claim=await store.claimJob({operationId,ownerId,leaseSeconds:300,signal:combined});
        if(['empty','complete'].includes(claim.status))return;
        if(claim.status!=='ready'){stop=true;result.errors.push({code:safe(claim.status)});return;}
        const job={...(claim.job??{}),leaseToken:claim.leaseToken??claim.job?.leaseToken};
        try {await execute(job);}
        catch(error){
          const code=combined.aborted?'aborted':safe(error?.code);stop=true;result.errors.push({jobId:uuid(job.jobId)?job.jobId:undefined,code});
          try {await store.failJob({jobId:job.jobId,leaseToken:job.leaseToken,code});} catch {}
        }
      }
    }
    await Promise.all(Array.from({length:config.concurrency},worker));
    const latest=expect(await store.getOperation({operationId}));
    const op=latest.operation??latest;
    observePlanning(op);
    result.operationRequests=op.requests??op.requestCount??null;result.operationCostUsd=op.costUsd??null;
    const complete=result.planningComplete&&!operationStale(op)&&(op.complete===true||op.status==='completed'||op.status==='succeeded'||Number.isInteger(op.totalJobs)&&op.totalJobs===op.succeeded);
    if(combined.aborted)return {...result,status:signal?.aborted?'aborted':'partial',code:signal?.aborted?'aborted':'runtime_limit'};
    if(operationStale(op))return {...result,status:'partial',code:'stale'};
    if(!result.planningComplete)return {...result,status:'partial',code:'planning_required'};
    if(result.errors.length)return {...result,status:result.errors.every(error=>['budget_exhausted','aborted'].includes(error.code))?'partial':'failed'};
    if(complete)return {...result,status:'ready',exitCode:0,complete:true};
    return {...result,status:'partial',code:stop?'budget_exhausted':'partial'};
  } catch(error){return {...result,status:signal?.aborted?'aborted':combined.aborted||error?.code==='wait_for_sync'?'partial':'failed',code:signal?.aborted?'aborted':combined.aborted?'runtime_limit':safe(error?.code)};}
}

export async function runDiscordSummaryBackfill({maxRuns=100,...options}={}) {
  if(!Number.isInteger(maxRuns)||maxRuns<1||maxRuns>10000)return {status:'invalid_request',exitCode:1,complete:false};
  let operationId=options.operationId,previous=null,staleRetries=0;
  const total={status:'partial',exitCode:1,complete:false,runs:0,replans:0,plannedGroups:0,planningSteps:0,planningCursor:null,planningTotal:null,planningComplete:null,planningStale:null,groups:0,processedRecords:0,representedOriginals:0,requests:0,costUsd:0};
  for(let run=0;run<maxRuns;run++) {
    const result=await runDiscordSummaries({...options,operationId});
    operationId=result.operationId??operationId;total.operationId=operationId;total.runs++;total.groups+=result.groups;total.processedRecords+=result.processedRecords;total.representedOriginals+=result.representedOriginals;total.requests+=result.requests;total.costUsd+=result.costUsd;
    total.plannedGroups+=result.plannedGroups??0;total.planningSteps+=result.planningSteps??0;total.planningCursor=result.planningCursor??total.planningCursor;total.planningTotal=result.planningTotal??total.planningTotal;total.planningComplete=result.planningComplete??total.planningComplete;
    total.replans+=result.replans??0;total.planningStale=result.planningStale??total.planningStale;
    if(result.complete)return {...total,status:result.status==='not_due'?'not_due':'ready',exitCode:0,complete:true};
    if(result.code==='wait_for_sync')return {...total,code:result.code,waitingSourceCount:result.waitingSourceCount,blockedGroupCount:result.blockedGroupCount};
    if(result.status!=='partial')return {...total,status:result.status,code:result.code??result.errors?.[0]?.code};
    if(result.code==='stale'&&result.planningStale===true||result.code==='planning_required'&&result.planningComplete===false){if(staleRetries++>=2)return {...total,code:result.code};previous=null;continue;}
    const progress=JSON.stringify([result.planningCursor,result.planningTotal,result.planningComplete,result.operationRequests,result.operationCostUsd,total.groups,total.requests,total.plannedGroups,total.planningSteps,total.replans,result.mapParts,result.reduceParts,result.cachedParts]);
    const planningMoved=(result.plannedGroups??0)>0||(result.planningSteps??0)>0||total.planningCursor!=null&&previous!=null&&JSON.parse(previous)[0]!==total.planningCursor;
    if(progress===previous||!planningMoved&&!result.groups&&!result.mapParts&&!result.reduceParts&&!result.requests)return {...total,code:'stalled'};
    previous=progress;
  }
  return {...total,code:'run_limit'};
}
