import {pathToFileURL} from 'node:url';
import {readDiscordSummaryConfig} from './summary-config.js';
import {runDiscordSummaries,runDiscordSummaryBackfill} from './summaries.js';
import {getDiscordSummarySchedule,normalizeDiscordSummaryAsOf} from './summary-schedule.js';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const fields=new Set(['status','code','exitCode','complete','operationId','policyRevision','replans','plannedGroups','planningSteps','planningCursor','planningTotal','planningComplete','planningStale','groups','processedRecords','representedOriginals','inputRecordCount','representedMessageCount','waitingSourceCount','blockedGroupCount','groupCount','cachedCount','totalJobs','pending','running','succeeded','failed','messageCount','segmentCount','inputChars','inputCharCount','inputBytes','mapParts','reduceParts','cachedParts','requests','runs','inputTokens','outputTokens','cachedInputTokens','costUsd','reservedCostUsd','operationRequests','operationCostUsd','estimatedRequests','estimatedMaxCostUsd']);
function publicResult(result){
  const statuses=new Set(['ready','not_due','failed','partial','aborted','not_configured','invalid_request','database_unavailable','forbidden','paused','stale']);
  const codes=new Set(['wait_for_sync','planning_required','budget_exhausted','runtime_limit','run_limit','stalled','source_changed','forbidden','paused','stale','lease_lost','rate_limited','provider_unavailable','provider_auth_failed','provider_refusal','provider_incomplete','invalid_summary','foreign_citation','output_too_large','usage_unavailable','reservation_failed','usage_commit_failed','coverage_failed','database_unavailable','invalid_request','aborted','partial']);
  const output={};
  for(const [key,value] of Object.entries(result))if(fields.has(key)){
    if(key==='status')output.status=statuses.has(value)?value:'failed';
    else if(key==='code')output.code=codes.has(value)?value:'database_unavailable';
    else if(key==='operationId'){if(uuid(value))output[key]=value;}
    else if(value==null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)&&value>=0)output[key]=value;
  }
  return output;
}
export function parseDiscordSummaryArgs(argv=[]){
  if(!Array.isArray(argv)||!['preview','bootstrap','weekly','monthly','scheduled','manualweekly','manualmonthly'].includes(argv[0]))return null;
  const parsed={command:argv[0],mode:argv[0]==='preview'?'bootstrap':argv[0]==='manualweekly'?'weekly':argv[0]==='manualmonthly'?'monthly':argv[0],maxRuns:100},seen=new Set();
  for(let i=1;i<argv.length;i++){
    const flag=argv[i],value=argv[++i];
    if(typeof value!=='string'||seen.has(flag))return null;seen.add(flag);
    if(flag==='--operation'&&parsed.command!=='preview'&&uuid(value))parsed.operationId=value;
    else if(flag==='--mode'&&parsed.command==='preview'&&['bootstrap','weekly','monthly'].includes(value))parsed.mode=value;
    else if(flag==='--as-of'&&parsed.command!=='scheduled'&&normalizeDiscordSummaryAsOf(value))parsed.asOf=normalizeDiscordSummaryAsOf(value);
    else if(flag==='--max-runs'&&['bootstrap','scheduled'].includes(parsed.command)&&/^[1-9][0-9]*$/.test(value)&&Number(value)<=10000)parsed.maxRuns=Number(value);
    else if(flag==='--max-groups'&&parsed.command!=='preview'&&/^[1-9][0-9]*$/.test(value)&&Number(value)<=1000)parsed.maxGroups=Number(value);
    else if(flag==='--max-requests'&&parsed.command!=='preview'&&/^[1-9][0-9]*$/.test(value)&&Number(value)<=1000)parsed.maxRequests=Number(value);
    else return null;
  }
  return parsed;
}
export async function runDiscordSummaryCli({argv=process.argv.slice(2),env=process.env,config=readDiscordSummaryConfig(env),store,provider,signal,now=new Date()}={}){
  const args=parseDiscordSummaryArgs(argv);
  if(!args)return {status:'invalid_request',exitCode:1,complete:false};
  if(signal?.aborted)return {status:'aborted',exitCode:1,complete:false};
  if(args.command!=='preview'&&!config.configured)return {status:'not_configured',exitCode:1,complete:false};
  try{
    if(!store){const module=await import('./summary-store.js');store=module.createDiscordSummaryStore({env});}
    if(!store.configured)return {status:'not_configured',exitCode:1,complete:false};
    if(args.command==='preview'){
      const plan=getDiscordSummarySchedule({now:args.asOf??now,mode:args.mode});
      if(plan.status!=='due')return {status:'invalid_request',exitCode:1,complete:false};
      const result=await store.preview({guildId:config.guildId,provider:config.provider,model:config.model,promptVersion:config.promptVersion,mode:plan.mode,asOf:plan.asOf,dueIdentity:plan.dueIdentity,signal});
      const counts=result.preview??result;
      const allowed=publicResult({...counts,status:result.status,exitCode:result.status==='ready'?0:1});
      return allowed;
    }
    const options={config,store,provider,signal,now,...args};
    const result=['bootstrap','scheduled'].includes(args.command)?await runDiscordSummaryBackfill(options):await runDiscordSummaries(options);
    return publicResult({...result,...(result.errors?.length&&!result.code?{code:result.errors[0].code}:{})});
  }catch{return {status:signal?.aborted?'aborted':'database_unavailable',exitCode:1,complete:false};}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const controller=new AbortController(),stop=()=>controller.abort();
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
  const result=await runDiscordSummaryCli({signal:controller.signal});
  console.log(JSON.stringify(result));process.exitCode=result.exitCode;
  process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);
}
