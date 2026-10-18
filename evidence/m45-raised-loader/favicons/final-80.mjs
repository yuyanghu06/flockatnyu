import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const out='evidence/m45-raised-loader/favicons',base='http://127.0.0.1:4185';
const report={checks:[],entries:[]};
try{
 const source=await fs.readFile('assets/branding/favicon.svg','utf8'),old=JSON.parse(await fs.readFile(out+'/extra-results.json','utf8'));
 const viewBox=source.match(/viewBox="([^"]+)"/)[1],transform=source.match(/<g id="favicon-mark" transform="([^"]+)"/)[1];assert.equal(viewBox,old.geometry.viewBox);assert(transform.includes('scale(0.8)'));
 const badge=source.match(/<rect\b[^>]+fill="#fff"[^>]*>/)[0],vb=viewBox.split(' ').map(Number);for(const [name,expect] of [['x',vb[0]],['y',vb[1]],['width',vb[2]],['height',vb[3]],['rx',vb[2]*.22]]){const n=Number(badge.match(new RegExp('\\b'+name+'="([^"]+)"'))[1]);assert(Math.abs(n-expect)<.001);}
 assert(source.includes('id="relief-bevel"')&&source.includes('id="relief-depth"'));assert(!/@keyframes|animation\s*:|<animate\b|<script\b/.test(source));
 report.geometry={scale:.8,relativeToInterimScale1:.8,relativeToEarlierSmallAt:.8/.65,viewBox,transform,badge};report.checks.push({name:'Final markscale0.8 is20%smaller than interim1; same rounded-white badge and embedded relief',pass:true});
 for(const entry of ['index.html','admin.html','docs/color-schemes.html']){
  const r=await fetch(base+'/'+entry);assert.equal(r.status,200);const html=await r.text(),tags=[...html.matchAll(/<link\b[^>]*rel="icon"[^>]*>/g)].map(m=>m[0]);assert.equal(tags.length,2);const result=[];
  for(const tag of tags){const href=tag.match(/href="([^"]+)"/)[1];assert(href.includes('v=raised-at-80'));const response=await fetch(new URL(href,base));assert.equal(response.status,200);const data=Buffer.from(await response.arrayBuffer()),ext=tag.includes('image/svg+xml')?'svg':'ico',mime=response.headers.get('content-type');assert(ext==='svg'?mime.includes('image/svg+xml'):/image\/(x-icon|vnd.microsoft.icon)/.test(mime));const hash=b=>createHash('sha256').update(b).digest('hex'),sourceHash=hash(await fs.readFile('assets/branding/favicon.'+ext));assert.equal(hash(data),sourceHash);result.push({href,status:200,mime,sha256:sourceHash});}
  report.entries.push({entry,icons:result});
 }
 report.checks.push({name:'All3 current production entry pages serve6exact final source icons with MIME and raised-at-80 cacheversion',pass:true});report.pass=true;
}catch(e){report.failure=e.stack;process.exitCode=1;}finally{await fs.writeFile(out+'/final-80-results.json',JSON.stringify(report,null,2)+'\n');console.log(report.pass?'PASS final0.8 favicon shape and fresh production bytes':report.failure);}
