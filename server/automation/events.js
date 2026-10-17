import {createHash} from 'node:crypto';
import {canonicalJson, plainObject, validLabel, validSourceId} from './validation.js';
export function eventUuid({source,sourceId,eventType,eventId,revision}) {
  const hex = createHash('sha256').update(JSON.stringify([source,sourceId,eventType,eventId,revision])).digest('hex').slice(0,32).split('');
  hex[12] = '5'; hex[16] = '89ab'[parseInt(hex[16],16) % 4];
  const s = hex.join('');
  return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
}
export function createEventUpdater({store,authorizeEvent,principal,config,now = () => new Date(),onEnqueued} = {}) {
  return {async enqueue({source,sourceId,eventType,eventId,revision,payload,signal} = {}) {
    if (!config?.enabled) return {status:'disabled'};
    if (!validLabel(source) || !validSourceId(sourceId) || !validLabel(eventType) || !validSourceId(eventId) || !validSourceId(revision) || payload === undefined) return {status:'invalid_request'};
    let serialized;
    try { serialized = canonicalJson(payload); } catch { return {status:'invalid_request'}; }
    if (Buffer.byteLength(serialized) > 60000) return {status:'input_too_large'};
    const envelope = {source,source_id:sourceId,event_type:eventType,event_id:eventId,revision,received_at:new Date(now()).toISOString(),payload:JSON.parse(serialized)};
    try { if (typeof authorizeEvent !== 'function' || await authorizeEvent({event:structuredClone(envelope),principal,signal}) !== true) return {status:'forbidden'}; } catch { return {status:'forbidden'}; }
    if (!plainObject(envelope)) return {status:'invalid_request'};
    const result = await store.enqueue({inputId:eventUuid({source,sourceId,eventType,eventId,revision}),envelope,signal});
    if (result.status === 'queued' && typeof onEnqueued === 'function') {
      // Do not hold a source delivery open while a model/tool batch runs.
      void Promise.resolve().then(()=>onEnqueued({signal})).catch(()=>{});
    }
    return result;
  }};
}
