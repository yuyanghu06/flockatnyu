import {createHmac,timingSafeEqual} from 'node:crypto';
import {canonicalJson} from './validation.js';
import {uuid,timestamp,safeHttps,text} from '../map/events.js';
const kinds=new Set(['presence','personal_plan']);
const types=new Set(['study','meeting','event','social','other']);
// Runtime receipts are exact, source-bound identity observations, never model grants.
export function validMemberParticipation(value) {
  return value&&uuid(value.sourceId)&&safeHttps(value.sourceUrl)&&uuid(value.personId)
    &&['discord','email'].includes(value.provider)&&text(value.providerUserId,320,1)
    &&(value.provider==='discord'?/^[1-9][0-9]{0,19}$/.test(value.providerUserId):/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.providerUserId))
    &&timestamp(value.reportedAt)!==null&&(value.label===undefined||text(value.label,200));
}
const sign=(value,key)=>createHmac('sha256',key).update(value).digest('hex');
export function encodeMemberPlan({participation,activityKind,typeId='other',calendarId,eventId,sourceHash,signingKey}) {
  if(typeof eventId!=='string'||!/^[A-Za-z0-9_-]{5,1024}$/.test(eventId)||!validMemberParticipation(participation)||!kinds.has(activityKind)||!types.has(typeId)||typeof signingKey!=='string'||signingKey.length<32)throw Error('invalid_member_plan');
  const value={version:1,activityKind,typeId,participation:{sourceId:participation.sourceId,sourceUrl:participation.sourceUrl,provider:participation.provider,providerUserId:participation.providerUserId,personId:participation.personId,reportedAt:participation.reportedAt,label:participation.label||''}};
  const payload=canonicalJson(value);
  if(Buffer.byteLength(payload)>1024)throw Error('member_plan_context_limit');
  return {memberPlan:payload,memberPlanSignature:sign(canonicalJson([calendarId,eventId,sourceHash,payload]),signingKey)};
}
export function decodeMemberPlan(event,{calendarId,signingKey}={}) {
  try {
    const data=event?.extendedProperties?.private;
    if(typeof signingKey!=='string'||signingKey.length<32||typeof data?.memberPlan!=='string'||Buffer.byteLength(data.memberPlan)>1024||!/^[a-f0-9]{64}$/.test(data.memberPlanSignature)||!/^[a-f0-9]{64}$/.test(data.updateAgentSource))return null;
    const expected=sign(canonicalJson([calendarId,event.id,data.updateAgentSource,data.memberPlan]),signingKey);
    if(!timingSafeEqual(Buffer.from(expected),Buffer.from(data.memberPlanSignature)))return null;
    const value=JSON.parse(data.memberPlan);
    if(value.version!==1||!kinds.has(value.activityKind)||!types.has(value.typeId)||!validMemberParticipation(value.participation))return null;
    return value;
  }catch{return null;}
}
export function createMemberPlansTools({client,sourceId,authorizeParticipation}={}) {
  const configured=client?.configured===true&&uuid(sourceId)&&typeof authorizeParticipation==='function';
  async function execute(args={},context={},cancel=false) {
    const {principal,signal,receipt}=context;
    if(!configured)return {status:'not_configured'};
    if(signal?.aborted)return {status:'aborted'};
    if(!principal?.allowedSourceIds?.includes(sourceId)||!validMemberParticipation(receipt)||args.sourceUrl!==receipt.sourceUrl
      ||await authorizeParticipation({principal,participation:receipt,signal})!==true)return {status:'forbidden_source'};
    const method=cancel?'cancelMemberPlan':'upsertMemberPlan';
    return client[method]({...args,trustedParticipation:receipt,principal:{...principal,calendarAccess:true,calendarId:client.calendarId,memberPlanReceipts:[receipt],memberPlanAuthorize:()=>authorizeParticipation({principal,participation:receipt,signal})},signal});
  }
  return Object.freeze({configured,upsert:(args,context)=>execute(args,context,false),cancel:(args,context)=>execute(args,context,true)});
}
