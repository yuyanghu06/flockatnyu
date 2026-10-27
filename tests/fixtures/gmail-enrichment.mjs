import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createTregEnrichmentClient} from '../../server/treg-enrich.js';
import {createTregCallLogger} from '../../server/treg-call-log.js';
import {createGmailEnrichmentWorker} from '../../server/gmail-enrichment/worker.js';

export const gmailSourceId='62000000-0000-4000-8000-000000000001';
export const gmailAccount='synthetic-club@example.com';
export const gmailNow='2026-10-26T22:00:00.000Z';
export const nativeLead={first_name:'Rae',last_name:'Example',email:'rae@example.com',workplace:{native:'object'},notes:null,provider_extra:{keep:[1,null,'exact native record']}};
export const enrichedEnvelope={output:{full_name:'Rae Example',email:'rae@example.com'},raw:nativeLead,_treg:{served_by:'synthetic.people.enrich',tried:['synthetic.people.enrich']}};
export const enrichmentUsage={provider:'synthetic.people.enrich',callId:'synthetic-enrich-call',costMicro:2500};
export function gmailCacheItem(overrides={}) {
  return {id:'63000000-0000-4000-8000-000000000001',jobId:'69000000-0000-4000-8000-000000000001',sourceId:gmailSourceId,account:gmailAccount,sourceVersion:'1'.repeat(64),version:'1',personKey:'sender:rae@example.com',email:'rae@example.com',requestId:'64000000-0000-4000-8000-000000000001',...overrides};
}
const contactIdFor=email=>{const value=createHash('sha256').update(`flockatnyu:treg-contact:v1:email:${email.toLowerCase()}`).digest('hex').slice(0,32).split('');value[12]='8';value[16]=(parseInt(value[16],16)&3|8).toString(16);const hex=value.join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;};

// A declared metadata-only cache contract for engine checks. Actual SQL and
// transaction behavior are exercised separately in gmail-enrichment-sql.test.
export async function gmailEnrichmentFixture(t,{items=[gmailCacheItem()],contacts=[],response=enrichedEnvelope,upstreamStatus=200,config={},callLogger}={}) {
  const root=await mkdtemp(join(tmpdir(),'flock-gmail-enrichment-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const logDirectory=join(root,'calls'),trace=[],requests=[],applied=[],mode={},clone=value=>structuredClone(value);
  const inputs=items.map(item=>({id:item.id,created_at:gmailNow,raw_input:{email:item.email,name:'Original sender',intake_extra:{preserve:true}}}));
  const states=clone(items).map(item=>({item,stage:'queued'}));let contactState=clone(contacts),renewCount=0;
  const ready=claim=>({status:'ready',claim:clone(claim)});
  const current=claim=>states.find(state=>state.item.jobId===claim?.jobId&&state.stage==='leased'&&state.item.version===claim.version&&state.item.leaseToken===claim.leaseToken);
  const cacheStore={configured:true,
    async probe(args){trace.push({operation:'probe',args:clone(args)});return mode.probe??{status:'ready',contract:'gmail-enrichment-v2',table:'contacts_cache',sourceIds:[gmailSourceId],account:gmailAccount,capabilities:{atomicClaims:true,versionChecks:true,durableRequestIds:true,durableBudget:true,readOnlyCache:true,metadataOnlyJobs:true,atomicContactCompletion:true}};},
    async claim(args){trace.push({operation:'claim',args:clone(args)});const state=states.find(row=>row.stage==='queued');if(!state)return {status:'empty'};state.stage='leased';Object.assign(state.item,{leaseToken:randomUUID(),leaseExpiresAt:'2026-10-26T23:00:00.000Z',budgetReservedMicro:args.reserveMicro});if(mode.claimMutate)mode.claimMutate(state.item);return ready(state.item);},
    async renew({claim,...args}){renewCount++;trace.push({operation:'renew',claim:clone(claim),args:clone(args)});if(mode.renewFailureAt===renewCount){const state=states.find(state=>state.item.jobId===claim.jobId);state.stage='lost';return {status:'stale'};}const state=current(claim);if(!state)return {status:'stale'};state.item.leaseExpiresAt='2026-10-26T23:01:00.000Z';return ready(state.item);},
    async complete(payload){trace.push({operation:'complete',payload:clone(payload)});const {claim,outcome,usage,rawInput,reason}=payload,state=current(claim);if(!state)return {status:'stale'};
      if(mode.completeFailureBefore)return {status:'unavailable',reason:'write_outcome_unknown'};
      let contactId=null,operation=null;
      if(outcome==='hit'){
        let contact=contactState.find(row=>typeof row.raw_input.email==='string'&&row.raw_input.email.toLowerCase()===claim.email.toLowerCase());
        if(contact){contactId=contact.id;operation='existing';}
        else{contactId=contactIdFor(claim.email);contact=contactState.find(row=>row.id===contactId);if(contact)operation='existing';else{operation='imported';contact={id:contactId,created_at:gmailNow,updated_at:gmailNow,raw_input:clone(rawInput)};contactState.push(contact);applied.push(clone(contact));}}
      }
      const receipt={jobId:claim.jobId,cacheId:claim.id,sourceVersion:claim.sourceVersion,requestId:claim.requestId,version:claim.version,outcome,contactId,operation,reason:reason??null,usage:clone(usage)};
      state.receipt=clone(receipt);state.stage='completed';
      if(mode.completeFailureAfter)return {status:'unavailable',reason:'write_outcome_unknown'};
      if(mode.malformedReceipt)return {status:'ready'};
      if(mode.staleReceipt)receipt.sourceVersion='2'.repeat(64);
      return {status:'ready',receipt};
    },
    async defer({claim,reason,uncertain}){trace.push({operation:'defer',claim:clone(claim),reason,uncertain});if(mode.deferFailure)return {status:'unavailable'};const state=current(claim);if(!state)return {status:'stale'};state.stage='deferred';state.reason=reason;state.uncertain=uncertain;state.item.version=String(Number(state.item.version)+1);return {status:'ready'};},
  };
  const logger=callLogger??createTregCallLogger({directory:logDirectory,env:{TREG_TOKEN:'synthetic-worker-treg-secret'}});t.after(()=>logger.close?.());
  const fetchImpl=async(input,init={})=>{assert.equal(String(input),'https://treg.to/call/treg.people.enrich','No Gmail or other business-service requests');const body=JSON.parse(init.body);assert.deepEqual(Object.keys(body),['email']);requests.push({body:clone(body),headers:new Headers(init.headers)});trace.push({operation:'treg'});if(mode.tregBefore)await mode.tregBefore();if(mode.tregReply)return mode.tregReply();return new Response(JSON.stringify(response),{status:upstreamStatus,headers:{'content-type':'application/json','x-treg-call-id':'synthetic-enrich-call','x-treg-cost-micro':'2500','x-treg-served-by':'synthetic.people.enrich'}});};
  const enrichmentClient=createTregEnrichmentClient({env:{TREG_TOKEN:'synthetic-worker-treg-secret',TREG_CALL_LOG_DIR:logDirectory},fetchImpl,callLogger:logger});
  const configuration={enabled:true,configured:true,sourceIds:[gmailSourceId],account:gmailAccount,scope:'sender',maxRequests:5,maxItems:5,maxCycleCostMicro:500000,maxDailyCostMicro:1000000,perCallMaxCostMicro:100000,leaseSeconds:120,pollMs:5000,...config};
  const worker=()=>createGmailEnrichmentWorker({config:configuration,cacheStore,enrichmentClient,now:()=>new Date(gmailNow)});
  return {worker:worker(),newWorker:worker,cacheStore,enrichmentClient,configuration,trace,requests,applied,mode,logDirectory,get inputs(){return clone(inputs);},get jobs(){return clone(states);},get contacts(){return clone(contactState);},requeue(id){states.find(state=>state.item.id===id).stage='queued';},async logs(){const names=await readdir(logDirectory);return Promise.all(names.filter(name=>name.endsWith('.jsonl')).map(async name=>(await readFile(join(logDirectory,name),'utf8')).trim().split('\n').map(line=>JSON.parse(line))));}};
}
