import {createHash} from 'node:crypto';
import {deflateSync,inflateSync} from 'node:zlib';
import {canonicalJson,plainObject} from './validation.js';

export const MAX_TASK_WIRE_BYTES=262144;
// A separate decoded-history guard protects memory. It does not enlarge SQL's
// row limit or any model, transcript or fragment-pool budget.
export const MAX_HISTORY_BYTES=16*1024*1024;
const envelopeKeys=['bytes','codec','data','sha256','version'];
const invalid=()=>{throw new Error('invalid_task_history');};
const hash=value=>createHash('sha256').update(value).digest('hex');

function stringBytes(value) {
  // PostgreSQL jsonb cannot represent NUL or isolated UTF-16 surrogates.
  for(let i=0;i<value.length;i++) {
    const code=value.charCodeAt(i);
    if(code===0)invalid();
    if(code>=0xd800&&code<=0xdbff) {
      const next=value.charCodeAt(++i);
      if(!(next>=0xdc00&&next<=0xdfff))invalid();
    } else if(code>=0xdc00&&code<=0xdfff)invalid();
  }
  return Buffer.byteLength(JSON.stringify(value));
}

function numberBytes(value) {
  if(!Number.isFinite(value))invalid();
  const text=JSON.stringify(value);
  if(!/[eE]/.test(text))return text.length;
  // jsonb stores JSON numbers as numeric and expands exponent notation in its
  // text form. Counting compact JavaScript JSON misses this expansion.
  const [coefficient,exponentText]=text.split(/[eE]/);
  const negative=coefficient[0]==='-',unsigned=negative?coefficient.slice(1):coefficient;
  const [whole,fraction='']=unsigned.split('.');
  const digits=whole.length+fraction.length,point=whole.length+Number(exponentText);
  return Number(negative)+(point<=0?2-point+digits:point>=digits?point:digits+1);
}

/** Exact byte count of the PostgreSQL jsonb text representation of ordinary JSON.
 * Key ordering changes no length; jsonb inserts a space after commas/colons.
 * Reject non-JSON values rather than count a lossy JSON.stringify conversion. */
export function postgresJsonBytes(value,{maxBytes=Infinity}={}) {
  if(!(maxBytes===Infinity||Number.isSafeInteger(maxBytes)&&maxBytes>=0))invalid();
  const ancestors=new Set();let total=0;
  const add=size=>{total+=size;if(total>maxBytes)invalid();};
  function visit(current,depth=0) {
    if(depth>256)invalid();
    if(current===null){add(4);return;}
    if(typeof current==='string'){add(stringBytes(current));return;}
    if(typeof current==='number'){add(numberBytes(current));return;}
    if(typeof current==='boolean'){add(current?4:5);return;}
    if(!Array.isArray(current)&&!plainObject(current)||ancestors.has(current))invalid();
    if(Object.getOwnPropertySymbols(current).length)invalid();
    ancestors.add(current);add(2);
    if(Array.isArray(current)) {
      if(Object.keys(current).length!==current.length||Object.getOwnPropertyNames(current).length!==current.length+1)invalid();
      for(let i=0;i<current.length;i++) {
        const descriptor=Object.getOwnPropertyDescriptor(current,String(i));
        if(!descriptor||!Object.hasOwn(descriptor,'value'))invalid();
        if(i)add(2);visit(descriptor.value,depth+1);
      }
    } else {
      const keys=Object.keys(current);
      if(Object.getOwnPropertyNames(current).length!==keys.length)invalid();
      for(let i=0;i<keys.length;i++) {
        const key=keys[i],descriptor=Object.getOwnPropertyDescriptor(current,key);
        if(!descriptor||!Object.hasOwn(descriptor,'value'))invalid();
        if(i)add(2);add(stringBytes(key)+2);visit(descriptor.value,depth+1);
      }
    }
    ancestors.delete(current);
  }
  visit(value);return total;
}

function historyBytes(history) {
  if(!Array.isArray(history))invalid();
  // Validate lossless JSON values before serialization, including shared/cyclic
  // structures and PostgreSQL-incompatible strings.
  postgresJsonBytes(history,{maxBytes:MAX_HISTORY_BYTES*2});
  // jsonb ignores object-key order when testing equality. Keep compressed bytes
  // equally stable so a repeated unversioned creation stays idempotent.
  const bytes=Buffer.from(canonicalJson(history));
  if(bytes.length>MAX_HISTORY_BYTES)invalid();
  return bytes;
}

/** Keep ordinary legacy rows byte-compatible. Compress only history when the
 * full plain row would exceed the existing database limit. */
export function encodeTaskInfo(info) {
  if(!plainObject(info))invalid();
  const hasHistory=Object.hasOwn(info,'executionHistory');
  if(hasHistory&&!Array.isArray(info.executionHistory))invalid();
  const size=postgresJsonBytes(info,{maxBytes:MAX_HISTORY_BYTES*2+MAX_TASK_WIRE_BYTES});
  if(size<=MAX_TASK_WIRE_BYTES)return info;
  if(!hasHistory)invalid();
  const {executionHistory,...core}=info;
  postgresJsonBytes(core,{maxBytes:MAX_TASK_WIRE_BYTES});
  const bytes=historyBytes(executionHistory),compressed=deflateSync(bytes,{level:6});
  const wire={...core,executionHistory:{version:1,codec:'deflate-base64',bytes:bytes.length,sha256:hash(bytes),data:compressed.toString('base64')}};
  postgresJsonBytes(wire,{maxBytes:MAX_TASK_WIRE_BYTES});
  return wire;
}

/** New readers accept legacy plain arrays and the exact private codec envelope.
 * Only a complete verified array is exposed to the pipeline. */
export function decodeTaskInfo(info) {
  if(!plainObject(info))invalid();
  postgresJsonBytes(info,{maxBytes:MAX_TASK_WIRE_BYTES});
  if(!Object.hasOwn(info,'executionHistory'))return info;
  const history=info.executionHistory;
  if(Array.isArray(history))return info;
  if(!plainObject(history)||Object.keys(history).sort().join('/')!==envelopeKeys.join('/')
    ||history.version!==1||history.codec!=='deflate-base64'
    ||!Number.isSafeInteger(history.bytes)||history.bytes<2||history.bytes>MAX_HISTORY_BYTES
    ||typeof history.sha256!=='string'||!/^[a-f0-9]{64}$/.test(history.sha256)
    ||typeof history.data!=='string'||!history.data.length||history.data.length>MAX_TASK_WIRE_BYTES
    ||history.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(history.data))invalid();
  const compressed=Buffer.from(history.data,'base64');
  if(compressed.toString('base64')!==history.data)invalid();
  const inflated=inflateSync(compressed,{maxOutputLength:history.bytes,info:true});
  if(inflated.engine.bytesWritten!==compressed.length||inflated.buffer.length!==history.bytes
    ||hash(inflated.buffer)!==history.sha256)invalid();
  const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(inflated.buffer));
  if(!Array.isArray(parsed))invalid();
  postgresJsonBytes(parsed,{maxBytes:MAX_HISTORY_BYTES*2});
  return {...info,executionHistory:parsed};
}
