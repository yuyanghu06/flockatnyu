import { normalizeContactContext, contactTextMessages } from './chat-contact-context.js';
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {canonicalJson} from './automation/validation.js';

const scope = principal => createHash('sha256').update(canonicalJson(principal)).digest('hex');
const validOrigin = value => {
  try {const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&url.origin===value&&!url.username&&!url.password;}catch{return false;}
};
const bounded = messages => messages.length<=20&&messages.reduce((n,m)=>n+m.content.length,0)<=16000
  &&Buffer.byteLength(JSON.stringify({messages:contactTextMessages(messages)}))<=32500;

// Website transport state only. Neither capabilities nor pending user text are
// source knowledge, audit data or a durable job queue.
export function createChatSteeringRegistry({now=()=>new Date(),maxRuns=100}={}) {
  const runs=new Map();
  function create({principal,origin,messages}) {
    if(!validOrigin(origin)||!principal?.id||runs.size>=maxRuns)return null;
    const runId=randomUUID(),steeringToken=randomBytes(32).toString('base64url'),owner=scope(principal);
    let reserved;
    try { reserved=contactTextMessages(messages); } catch { return null; }
    const entries=new Map(),subjectId=reserved.at(-1)?.contactContext?.id??null;
    let pending=[],open=true,emit=()=>{},wake;
    let changed=new Promise(resolve=>{wake=resolve;});
    const entry={
      runId,steeringToken,
      bind(fn){emit=fn;},
      hasPending:()=>pending.length>0,
      waitForInput:()=>pending.length?Promise.resolve():changed,
      drain(){if(!open)return [];const result=pending;pending=[];changed=new Promise(resolve=>{wake=resolve;});return result;},
      applied(value){if(!open)return false;value.applied=true;emit({type:'steering',messageId:value.messageId,sequence:value.sequence,status:'applied'});return true;},
      closeIfEmpty(){if(pending.length)return false;open=false;return true;},
      finish(){open=false;pending=[];wake();runs.delete(runId);},
      enqueue({principal:caller,origin:callerOrigin,token,body}){
        if(!open)return {status:'closed',httpStatus:409};
        if(!caller?.id||callerOrigin!==origin||scope(caller)!==owner||typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token)
          ||!timingSafeEqual(Buffer.from(token),Buffer.from(steeringToken)))return {status:'access_denied',httpStatus:403};
        if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['messageId','text','contactContext'].includes(key))
          ||typeof body.messageId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(body.messageId)
          ||typeof body.text!=='string'||!body.text.trim()||body.text.length>8000)return {status:'invalid_request',httpStatus:400};
        let contactContext;
        try { contactContext=normalizeContactContext(body.contactContext); } catch { return {status:'invalid_request',httpStatus:400}; }
        if((contactContext?.id??null)!==subjectId)return {status:'context_conflict',httpStatus:409};
        const previous=entries.get(body.messageId);
        if(previous)return previous.text===body.text&&canonicalJson(previous.contactContext??null)===canonicalJson(contactContext??null)
          ?{status:'accepted',messageId:previous.messageId,sequence:previous.sequence,applied:previous.applied===true,httpStatus:202}
          :{status:'conflict',httpStatus:409};
        if(!bounded([...reserved,{role:'user',content:body.text,...(contactContext===undefined?{}:{contactContext})}]))return {status:'input_limit',httpStatus:413};
        const value={messageId:body.messageId,text:body.text,...(contactContext===undefined?{}:{contactContext}),sequence:entries.size+1,receivedAt:new Date(now()).toISOString()};
        entries.set(value.messageId,value);reserved.push({role:'user',content:value.text,...(contactContext===undefined?{}:{contactContext:structuredClone(contactContext)})});pending.push(value);
        emit({type:'steering',messageId:value.messageId,sequence:value.sequence,status:'accepted'});wake();
        return {status:'accepted',messageId:value.messageId,sequence:value.sequence,applied:false,httpStatus:202};
      },
    };
    runs.set(runId,entry);return entry;
  }
  return Object.freeze({create,enqueue(runId,input){return runs.get(runId)?.enqueue(input)??{status:'closed',httpStatus:409};}});
}
