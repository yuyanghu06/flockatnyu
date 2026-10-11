// Server-only. Never import this module from src/ or expose this object to clients.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id=value=>typeof value==='string'&&UUID.test(value);
const memberId=value=>value==='local-development'||id(value);
const text=(value,max)=>typeof value==='string'?value.slice(0,max):'';
const timestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
function url(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
function scope(principal){return memberId(principal?.id)&&Array.isArray(principal.allowedSourceIds)&&principal.allowedSourceIds.length>0&&principal.allowedSourceIds.length<=100&&principal.allowedSourceIds.every(id)?{member:principal.id,sources:[...new Set(principal.allowedSourceIds)]}:null;}
export const EMBEDDING_CONTRACT=Object.freeze({dimensions:1536,model:null,provider:null,generated:false,search:'full_text'});

export function createKnowledgeRepository({env=process.env,fetchImpl=globalThis.fetch}={}){
  let base=null;try{const u=new URL(env.SUPABASE_URL);if((u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))&&!u.username&&!u.password&&!u.search&&!u.hash)base=u.origin;}catch{}
  const key=typeof env.SUPABASE_SERVICE_ROLE_KEY==='string'?env.SUPABASE_SERVICE_ROLE_KEY.trim():'';
  const configured=Boolean(base&&key&&typeof fetchImpl==='function');
  async function rpc(name,args,signal){
    if(!configured)return {status:'not_configured'};
    if(signal?.aborted)return {status:'aborted'};
    const timeout=AbortSignal.timeout(12000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
    try{
      const response=await fetchImpl(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:combined,redirect:'error'});
      if(!response.ok)return {status:response.status===401||response.status===403?'forbidden':'unavailable'};
      const raw=await response.text();if(raw.length>300000)return {status:'unavailable'};
      return {status:'ready',data:raw?JSON.parse(raw):null};
    }catch{return {status:signal?.aborted?'aborted':'unavailable'};}
  }
  function checked(principal){const s=scope(principal);return s?{scope:s}: {status:'forbidden'};}
  async function search({query,principal,limit=5,buildingId=null,signal}={}){
    const auth=checked(principal);if(!auth.scope)return {status:auth.status,sources:[]};
    if(typeof query!=='string'||!query.trim()||query.length>500||(buildingId!==null&&(typeof buildingId!=='string'||buildingId.length>100)))return {status:'invalid_request',sources:[]};
    const count=Number.isInteger(limit)?Math.max(1,Math.min(8,limit)):5;
    const result=await rpc('knowledge_search',{p_member_id:auth.scope.member,p_allowed_source_ids:auth.scope.sources,p_query:query.trim(),p_limit:count,p_building_id:buildingId},signal);
    if(result.status!=='ready')return {status:result.status,sources:[]};
    if(!Array.isArray(result.data))return {status:'unavailable',sources:[]};
    let budget=12000;
    const sources=[];
    for(const row of result.data.slice(0,count)){
      if(!row||typeof row!=='object'||!id(row.id)||!id(row.document_id)||!auth.scope.sources.includes(row.source_id))continue;
      const excerpt=text(row.excerpt,Math.min(1800,budget));budget-=excerpt.length;if(!excerpt)continue;
      sources.push({id:row.id,documentId:row.document_id,sourceId:row.source_id,title:text(row.title,300),url:url(row.url),excerpt,sourceUpdatedAt:timestamp(row.source_updated_at),indexedAt:timestamp(row.indexed_at),buildingId:row.building_id?text(row.building_id,100):null});
    }
    return {status:sources.length?'ready':'empty',sources};
  }
  async function getDocument({documentId,principal,signal}={}){
    const auth=checked(principal);if(!auth.scope)return {status:auth.status,document:null};
    if(!id(documentId))return {status:'invalid_request',document:null};
    const result=await rpc('knowledge_get_document',{p_member_id:auth.scope.member,p_allowed_source_ids:auth.scope.sources,p_document_id:documentId},signal);
    if(result.status!=='ready')return {status:result.status,document:null};
    const d=result.data;if(!d||!auth.scope.sources.includes(d.source_id)||d.id!==documentId)return {status:'empty',document:null};
    return {status:'ready',document:{id:d.id,sourceId:d.source_id,externalId:text(d.external_id,500),version:text(d.source_version,200),title:text(d.title,300),url:url(d.url),originalText:text(d.original_text,200000),sourceUpdatedAt:timestamp(d.source_updated_at),indexedAt:timestamp(d.indexed_at),buildingId:d.building_id?text(d.building_id,100):null}};
  }
  async function upsertDocument({record,principal,signal}={}){
    const auth=checked(principal);if(!auth.scope)return {status:auth.status};
    if(!record||!id(record.id)||!auth.scope.sources.includes(record.sourceId))return {status:'forbidden'};
    if(typeof record.externalId!=='string'||!record.externalId||record.externalId.length>500||typeof record.title!=='string'||!record.title||record.title.length>300||typeof record.originalText!=='string'||record.originalText.length>200000||typeof record.version!=='string'||!record.version||record.version.length>200||!url(record.url)||!timestamp(record.sourceUpdatedAt)||!Array.isArray(record.allowedMemberIds)||record.allowedMemberIds.length>500||!record.allowedMemberIds.every(memberId)||!Array.isArray(record.chunks)||record.chunks.length>64||record.chunks.some(c=>typeof c!=='string'||!c.trim()||c.length>2000)||(record.buildingId!=null&&(typeof record.buildingId!=='string'||record.buildingId.length>100)))return {status:'invalid_request'};
    const result=await rpc('knowledge_upsert_document',{p_member_id:auth.scope.member,p_allowed_source_ids:auth.scope.sources,p_record:{id:record.id,source_id:record.sourceId,external_id:record.externalId,source_version:record.version,title:record.title,url:url(record.url),original_text:record.originalText,source_updated_at:timestamp(record.sourceUpdatedAt),building_id:record.buildingId??null,allowed_member_ids:[...new Set(record.allowedMemberIds)],chunks:record.chunks}},signal);
    return result.status==='ready'&&id(result.data)?{status:'ready',documentId:result.data}:{status:result.status==='ready'?'unavailable':result.status};
  }
  async function deleteDocument({documentId,sourceId,principal,signal}={}){
    const auth=checked(principal);if(!auth.scope||!auth.scope.sources.includes(sourceId))return {status:'forbidden'};
    if(!id(documentId))return {status:'invalid_request'};
    const result=await rpc('knowledge_delete_document',{p_member_id:auth.scope.member,p_allowed_source_ids:auth.scope.sources,p_document_id:documentId,p_source_id:sourceId},signal);
    return result.status==='ready'?{status:result.data===true?'ready':'empty'}:{status:result.status};
  }
  return Object.freeze({configured,status:configured?'configured':'not_configured',search,getDocument,upsertDocument,deleteDocument});
}


