import { chromium } from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out=process.env.MAP_EVIDENCE??'evidence/m3-campus-details';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(process.env.MAP_URL??'http://127.0.0.1:4173');await page.waitForFunction(()=>window.__map?.snapshot().status==='ready');
const initial=await page.evaluate(()=>window.__map.snapshot());const p=initial.landmarks.find(x=>x.id==='nyu-john-a-paulson-center');assert.equal(p.meshes,8);assert.equal(p.triangles,52440);
const target=p.bounds.min.map((v,i)=>(v+p.bounds.max[i])/2),report={initial,views:[],errors};
for(const[label,offset,point]of[['south-east',[210,150,210],[720,500]],['north-west',[-210,150,-210],[850,400]],['south-west',[-230,120,190],[720,500]]]){
 await page.selectOption('#building','');await page.click('#camera-open');await page.fill('#camera-json',JSON.stringify({...initial.camera,target,position:target.map((v,i)=>v+offset[i])}));await page.click('#camera-restore');await page.locator('#camera-dialog .close').click();await page.waitForTimeout(300);
 await page.mouse.move(10,990);await page.screenshot({path:`${out}/paulson-${label}.png`});await page.mouse.move(...point);await page.waitForTimeout(30);assert.equal(await page.evaluate(()=>window.__map.snapshot().hovered),p.id);await page.mouse.click(...point);assert.equal(await page.evaluate(()=>window.__map.snapshot().selected),p.id);report.views.push({label,point});
}
await page.screenshot({path:`${out}/paulson-selected.png`});await page.selectOption('#building','');await page.click('#reset');await page.waitForTimeout(300);
report.performance=await page.evaluate(async()=>{const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');const samples=await new Promise(resolve=>{let last=performance.now();const values=[];function frame(t){values.push(t-last);last=t;if(values.length<91)requestAnimationFrame(frame);else resolve(values.slice(1));}requestAnimationFrame(frame);});samples.sort((a,b)=>a-b);const mean=samples.reduce((a,b)=>a+b)/samples.length;return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),frames:samples.length,meanMs:mean,fps:1000/mean,p95Ms:samples[Math.floor(samples.length*.95)],render:window.__map.snapshot().render};});
assert.equal(errors.length,0);await browser.close();fs.writeFileSync(`${out}/final-visual-results.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({views:report.views,paulson:p,performance:report.performance,errors},null,2));
