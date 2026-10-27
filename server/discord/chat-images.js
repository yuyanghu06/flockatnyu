import {MAX_FILES,MAX_FILE_BYTES,MAX_ATTACHMENT_BYTES,normalizeAttachments,attachmentBudget,attachmentMime} from "../chat/attachments.js";
import {SOURCE_TOOL_TIMEOUT_MS} from "../shared/source-timeout.js";

export const DISCORD_IMAGE_CANDIDATE_LIMIT = 40;
const id=value=>typeof value==='string'&&/^[0-9]{1,20}$/.test(value);
const imageMimes=new Set(['image/png','image/jpeg','image/webp']);
const fail=code=>{throw Object.assign(new Error(code),{code});};
const safeName=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=180&&!/[\x00-\x1f\x7f-\x9f/\\]/.test(value)?value:'attachment';

/** Accept only a Discord attachment URL bound to this freshly fetched message.
 * Raw-path checks precede URL parsing so normalization cannot hide traversal. */
export function discordImageAttachmentUrl(candidate) {
  const raw=candidate?.url;
  if(typeof raw!=='string'||raw.length>3000||/[\s\\\u0000-\u001f\u007f]/.test(raw))return null;
  const match=/^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\/([0-9]{1,20})\/([0-9]{1,20})\/([^/?#]+)(?:\?[^#]*)?$/.exec(raw);
  if(!match||match[2]!==candidate.channelId||match[3]!==candidate.attachmentId)return null;
  try {
    const filename=decodeURIComponent(match[4]);
    if(filename!==candidate.name||filename==='.'||filename==='..'||safeName(filename)!==filename)return null;
    const url=new URL(raw);
    if(url.port||url.username||url.password||url.hash||url.pathname!==`/attachments/${match[2]}/${match[3]}/${match[4]}`)return null;
    for(const [key,value] of url.searchParams)if(!['ex','is','hm'].includes(key)||!/^[a-f0-9]{1,256}$/i.test(value)||url.searchParams.getAll(key).length!==1)return null;
    return url.href;
  }catch{return null;}
}
async function abortable(work,signal) {
  if(signal.aborted)fail('aborted');
  let onAbort;
  try{return await Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{
    onAbort=()=>reject(Object.assign(new Error('aborted'),{code:'aborted'}));signal.addEventListener('abort',onAbort,{once:true});
  })]);}finally{signal.removeEventListener('abort',onAbort);}
}
async function download(candidate,{fetchImpl,signal,remainingBytes,downloadBudget}) {
  const url=discordImageAttachmentUrl(candidate);
  if(!url)fail('invalid_attachment_url');
  let mimeType;
  try{mimeType=attachmentMime(candidate.name,candidate.mimeType);}catch{fail('unsupported_type');}
  if(!imageMimes.has(mimeType))fail('unsupported_type');
  if(!Number.isSafeInteger(candidate.size)||candidate.size<=0||candidate.size>MAX_FILE_BYTES)fail('attachment_size');
  if(candidate.size>remainingBytes||candidate.size>MAX_ATTACHMENT_BYTES-downloadBudget.bytes)fail('attachment_total');
  // No bot token, ambient credentials or redirect following is used for CDN I/O.
  const response=await abortable(async()=>{
    const value=await fetchImpl(url,{method:'GET',redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',signal});
    if(signal.aborted){void value.body?.cancel().catch(()=>{});fail('aborted');}
    return value;
  },signal);
  let reader;
  try {
    if(!response.ok||response.redirected)fail('download_unavailable');
    if(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!==mimeType)fail('attachment_type');
    const length=response.headers.get('content-length');
    if(length!==null&&(!/^[0-9]+$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)!==candidate.size))fail('attachment_size');
    reader=response.body?.getReader();if(!reader)fail('download_unavailable');
    const chunks=[];let size=0;
    while(true) {
      const part=await abortable(()=>reader.read(),signal);if(part.done)break;
      size+=part.value.byteLength;
      // Charge every consumed byte, including data later rejected by a size,
      // stream or signature check. Failed candidates cannot reset the I/O cap.
      downloadBudget.bytes+=part.value.byteLength;
      if(downloadBudget.bytes>MAX_ATTACHMENT_BYTES)fail('attachment_total');
      if(size>candidate.size||size>MAX_FILE_BYTES||size>remainingBytes)fail('attachment_size');
      chunks.push(part.value);
    }
    if(size!==candidate.size)fail('attachment_size');
    return {name:candidate.name,mimeType,data:Buffer.concat(chunks).toString('base64')};
  }finally {
    // Cancellation must not prolong the deadline if an upstream ignores abort.
    if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{}}
    else void response.body?.cancel().catch(()=>{});
  }
}

/** Request-memory bytes travel separately from CDN-URL-free source metadata. This
 * helper does not authorize sources; the loader must recheck access after I/O. */
export async function loadDiscordChatImages({candidates=[],guildId,channelId,requestId,signal,fetchImpl=globalThis.fetch,maxRuntimeMs=SOURCE_TOOL_TIMEOUT_MS}={}) {
  if(![guildId,channelId,requestId].every(id))throw new TypeError('Invalid Discord image context');
  const imageSignal=AbortSignal.any([AbortSignal.timeout(maxRuntimeMs),...(signal?[signal]:[])]);
  const images=[],imageAttachments=[],seen=new Set(),downloadBudget={bytes:0};let budget=attachmentBudget(),partial=false;
  const rows=Array.isArray(candidates)?candidates:[];
  if(rows.length>DISCORD_IMAGE_CANDIDATE_LIMIT)partial=true;
  for(const row of rows.slice(0,DISCORD_IMAGE_CANDIDATE_LIMIT)) {
    if(!row||row.guildId!==guildId||row.channelId!==channelId||!id(row.messageId)||!id(row.attachmentId)
      ||!['trigger','reply','recent'].includes(row.origin)||row.origin==='trigger'&&row.messageId!==requestId
      ||row.origin!=='trigger'&&BigInt(row.messageId)>=BigInt(requestId)) {partial=true;continue;}
    const key=`${row.channelId}:${row.attachmentId}`;if(seen.has(key))continue;seen.add(key);
    const item={messageId:row.messageId,attachmentId:row.attachmentId,origin:row.origin,name:safeName(row.name),
      url:`https://discord.com/channels/${guildId}/${channelId}/${row.messageId}`,status:'unavailable',reason:'download_unavailable'};
    images.push(item);
    if(imageAttachments.length>=MAX_FILES||downloadBudget.bytes>=MAX_ATTACHMENT_BYTES){item.status='omitted';item.reason='attachment_total';partial=true;continue;}
    try {
      if(safeName(row.name)!==row.name)fail('unsupported_type');
      const attachment=await download(row,{fetchImpl,signal:imageSignal,remainingBytes:MAX_ATTACHMENT_BYTES-budget.bytes,downloadBudget});
      const trial={...budget};const normalized=normalizeAttachments([attachment],trial)[0];budget=trial;
      imageAttachments.push(normalized);item.status='ready';item.reason=null;
    }catch(error) {
      item.reason=['invalid_attachment_url','unsupported_type','attachment_size','attachment_total','attachment_type','attachment_signature'].includes(error?.code)?error.code:imageSignal.aborted?'aborted':'download_unavailable';
      item.status=item.reason==='unsupported_type'?'unsupported':item.reason==='attachment_total'?'omitted':'unavailable';partial=true;
      if(imageSignal.aborted)break;
    }
  }
  return {imageAttachments,imageContext:{status:partial?(imageAttachments.length?'partial':'unavailable'):imageAttachments.length?'ready':'none',
    reason:partial?(imageSignal.aborted?'aborted':'image_coverage_limited'):null,candidateCount:images.length,loadedCount:imageAttachments.length,images}};
}
