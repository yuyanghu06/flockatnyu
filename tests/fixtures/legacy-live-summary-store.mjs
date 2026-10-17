// Historical M25/M28 fixture only. Excluded from deployment; never import from server.
import {createDiscordStore} from '../../server/discord/store.js';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const snowflake=v=>typeof v==='string'&&/^[0-9]{1,20}$/.test(v);
const jobRow=r=>r?{jobId:r.id,sourceId:r.source_id,guildId:r.guild_id,channelId:r.channel_id,channelName:r.channel_name,tier:r.tier,periodKey:r.period_key,periodStart:r.period_start,periodEnd:r.period_end,policyRevision:Number(r.policy_revision),leaseToken:r.lease_token,provider:r.provider,model:r.model,promptVersion:r.prompt_version}:null;
export function createDiscordLiveSummaryStore({env=process.env,fetchImpl=globalThis.fetch}={}) {
  const archive=createDiscordStore({env,fetchImpl});let base;
  try{const u=new URL(env.SUPABASE_URL);if((u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))&&!u.username&&!u.password&&!u.search&&!u.hash)base=u.origin;}catch{}
  const key=(env.SUPABASE_SERVICE_ROLE_KEY||'').trim(),configured=Boolean(base&&key&&typeof fetchImpl==='function');
  async function rpc(name,args={},signal) {
    if(!configured)return {status:'not_configured'};if(signal?.aborted)return {status:'aborted'};
    try{const timeout=AbortSignal.timeout(60000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
      const response=await fetchImpl(`${base}/rest/v1/rpc/discord_live_summary_${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:combined,redirect:'error'});
      if(!response.ok){let code;try{code=(await response.json()).code;}catch{}return {status:code==='40001'||response.status===409?'stale':code==='23514'?'invalid_request':[401,403].includes(response.status)?'forbidden':'unavailable'};}
      const raw=await response.text();if(raw.length>3000000)return {status:'unavailable'};return {status:'ready',data:raw?JSON.parse(raw):null};
    }catch{return {status:signal?.aborted?'aborted':'unavailable'};}
  }
  const jobArgs=({jobId,leaseToken})=>uuid(jobId)&&uuid(leaseToken)?{p_job_id:jobId,p_lease_token:leaseToken}:null;
  async function beginRun({guildId,config,signal}={}) {if(!snowflake(guildId))return {status:'invalid_request'};const r=await rpc('begin_run',{p_guild_id:guildId,p_max_cost_usd:config.maxRunCostUsd,p_max_requests:config.maxRequests},signal);return {status:r.status,runId:r.data?.id};}
  async function plan({guildId,config,asOf,mode='scheduled',signal}={}) {const r=await rpc('plan',{p_guild_id:guildId,p_as_of:asOf,p_mode:mode,p_provider:config.provider,p_model:config.model,p_prompt_version:config.promptVersion},signal);return {status:r.status,...(r.status==='ready'?r.data:{})};}
  async function claimJob({guildId,config,signal}={}) {const r=await rpc('claim',{p_guild_id:guildId,p_provider:config.provider,p_model:config.model,p_prompt_version:config.promptVersion,p_lease_seconds:config.leaseSeconds},signal);return {status:r.status,job:r.status==='ready'?jobRow(r.data):null};}
  async function renewJob(options={}) {const args=jobArgs(options);if(!args)return {status:'invalid_request'};const r=await rpc('renew',args,options.signal);return {status:r.status==='ready'?(r.data===true?'ready':'stale'):r.status};}
  async function finishJob({summary,citations,coverage,...options}={}) {const args=jobArgs(options);if(!args)return {status:'invalid_request'};const r=await rpc('finish',{...args,p_summary:summary,p_citations:citations,p_coverage:coverage},options.signal);return {status:r.status,result:r.data};}
  async function failJob(options={}) {const args=jobArgs(options);if(!args)return {status:'invalid_request'};const r=await rpc('fail',args,options.signal);return {status:r.status};}
  async function reserveRequest({runId,jobId=null,leaseToken=null,vectorId=null,vectorLease=null,reservationId,inputTokens,outputTokens,maxCostUsd,signal}={}) {
    if(!uuid(runId)||!uuid(reservationId))return {status:'invalid_request'};
    const r=await rpc('reserve',{p_run_id:runId,p_reservation_id:reservationId,p_job_id:jobId,p_lease_token:leaseToken,p_vector_id:vectorId,p_vector_lease:vectorLease,p_input_tokens:inputTokens,p_output_tokens:outputTokens,p_max_cost_usd:maxCostUsd},signal);
    return {status:r.status==='ready'?(r.data?.dispatchAllowed?'ready':r.data?.status||'budget_exhausted'):r.status,reservationId,dispatchAllowed:r.data?.dispatchAllowed===true};
  }
  async function commitUsage({reservationId,status,usage,signal}={}) {const r=await rpc('commit_usage',{p_reservation_id:reservationId,p_status:status,p_usage:usage||{}},signal);return {status:r.status==='ready'?(r.data===true?'ready':'stale'):r.status};}
  async function queueEmbeddings({guildId,limit=1000,signal}={}) {const r=await rpc('queue_embeddings',{p_guild_id:guildId,p_limit:limit},signal);return {status:r.status,queued:r.data||0};}
  async function claimEmbedding({guildId,signal}={}) {const r=await rpc('claim_embedding',{p_guild_id:guildId},signal);return {status:r.status,item:r.data};}
  async function saveEmbedding({id,leaseToken,contentHash,vector,signal}={}) {if(!uuid(id)||!uuid(leaseToken)||!Array.isArray(vector)||vector.length!==1536||!vector.every(Number.isFinite))return {status:'invalid_request'};const r=await rpc('save_embedding',{p_id:id,p_lease_token:leaseToken,p_content_hash:contentHash,p_vector:JSON.stringify(vector)},signal);return {status:r.status==='ready'?(r.data===true?'ready':'stale'):r.status};}
  async function releaseEmbedding({id,leaseToken,signal}={}) {const r=await rpc('release_embedding',{p_id:id,p_lease_token:leaseToken},signal);return {status:r.status};}
  async function getStatus({guildId,signal}={}) {const r=await rpc('status',{p_guild_id:guildId},signal);return {status:r.status,counts:r.data};}
  async function cutover({guildId,expectedPolicyRevision,deleteRaw=false,signal}={}) {const r=await rpc('cutover',{p_guild_id:guildId,p_expected_policy_revision:expectedPolicyRevision,p_delete_raw:deleteRaw},signal);return {status:r.status,...r.data};}
  async function search({query='',principal,channelIds=[],from=null,to=null,limit=5,vector=null,signal}={}) {
    const allowed=principal?.allowedSourceIds;
    if(!Array.isArray(allowed)||!allowed.length||allowed.length>500||!allowed.every(uuid))return {status:'forbidden',sources:[]};
    if(typeof query!=='string'||query.length>500||!Array.isArray(channelIds)||channelIds.length>100||!channelIds.every(snowflake)||from!=null&&!Number.isFinite(Date.parse(from))||to!=null&&!Number.isFinite(Date.parse(to))||from&&to&&Date.parse(from)>=Date.parse(to)||!Number.isInteger(limit)||limit<1||limit>8||vector!=null&&(!Array.isArray(vector)||vector.length!==1536||!vector.every(Number.isFinite)))return {status:'invalid_request',sources:[]};
    const r=await rpc('search',{p_member_id:principal?.id ?? null,p_allowed_source_ids:[...new Set(allowed)],p_query:query.trim(),p_channel_ids:channelIds,p_from:from?new Date(from).toISOString():null,p_to:to?new Date(to).toISOString():null,p_limit:limit,p_vector:vector?JSON.stringify(vector):null},signal);
    if(r.status!=='ready'||!Array.isArray(r.data))return {status:r.status==='ready'?'unavailable':r.status,sources:[]};
    const sources=r.data.filter(row=>allowed.includes(row.sourceId)&&uuid(row.summaryId)&&(!channelIds.length||channelIds.includes(row.channelId))&&(!from||Date.parse(row.periodEnd)>Date.parse(from))&&(!to||Date.parse(row.periodStart)<Date.parse(to))).map(row=>({...row,id:row.summaryId,documentId:row.summaryId,title:`${row.channelName} · ${row.tier} ${row.periodKey}`,kind:'discord_summary',url:`https://discord.com/channels/${row.guildId}/${row.channelId}`,excerpt:JSON.stringify(row.summary),sourceUpdatedAt:row.periodEnd,indexedAt:null}));
    return {status:sources.length?'ready':'empty',sources};
  }
  return Object.freeze({configured,getPolicy:archive.getPolicy,listSyncChannels:archive.listSyncChannels,beginRun,plan,claimJob,renewJob,finishJob,failJob,reserveRequest,commitUsage,queueEmbeddings,claimEmbedding,saveEmbedding,releaseEmbedding,getStatus,cutover,search});
}
