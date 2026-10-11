import { chromium } from 'playwright-core';
import fs from 'node:fs';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
await page.goto(process.env.MAP_URL??'http://127.0.0.1:4173');
await page.waitForFunction(()=>window.__map?.snapshot().status==='ready');
const result=await page.evaluate(async()=>{
  const gl=document.querySelector('canvas').getContext('webgl2'),info=gl.getExtension('WEBGL_debug_renderer_info');
  const renderer=info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
  const times=await new Promise(resolve=>{let prev=performance.now();const values=[];function frame(t){values.push(t-prev);prev=t;if(values.length<61)requestAnimationFrame(frame);else resolve(values.slice(1));}requestAnimationFrame(frame);});
  times.sort((a,b)=>a-b);const mean=times.reduce((a,b)=>a+b,0)/times.length;
  return {renderer,frames:times.length,meanMs:mean,fps:1000/mean,p95Ms:times[Math.floor(times.length*.95)],snapshot:window.__map.snapshot()};
});
await browser.close();const out=process.env.MAP_EVIDENCE??'evidence/m3-campus-details';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(`${out}/default-gpu-performance.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({renderer:result.renderer,frames:result.frames,meanMs:result.meanMs,fps:result.fps,p95Ms:result.p95Ms,render:result.snapshot.render},null,2));
