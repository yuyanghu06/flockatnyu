import {canonicalDiscordSummaryJson} from './summary-provider.js';
export function chunkLiveSummaryEvidence(envelope,maxBytes=6000) {
  if(!Number.isInteger(maxBytes)||maxBytes<4||maxBytes>6000)throw new Error('invalid_request');
  const text=canonicalDiscordSummaryJson(envelope),chunks=[];let chunk='',size=0;
  // Code points keep UTF-16 surrogate pairs intact. UTF-8 byte count is a
  // conservative token upper bound, below the provider's per-input token limit.
  for(const point of text){const n=Buffer.byteLength(point,'utf8');if(size+n>maxBytes){chunks.push(chunk);chunk='';size=0;}chunk+=point;size+=n;}
  if(chunk)chunks.push(chunk);return chunks;
}
