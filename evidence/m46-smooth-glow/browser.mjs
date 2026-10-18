import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='evidence/m46-smooth-glow';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const report={chrome:browser.version(),checks:[],errors:[],cycles:[],limitations:['One isolated headless Chrome desktop Bobst case; no broad map/DPR/GPU performance acceptance.','API requests intercepted; no backend/model calls.','Screenshot timing includes browser capture latency; exact envelope timing is established by independent Node tests.']};
await page.addInitScript(()=>{window.__shaderCompiles=0;for(const Klass of [window.WebGLRenderingContext,window.WebGL2RenderingContext])if(Klass){const original=Klass.prototype.compileShader;Klass.prototype.compileShader=function(...args){window.__shaderCompiles++;return original.apply(this,args);};}});
await page.route('**/api/**',r=>r.fulfill({json:{chat:{configured:false},access:{allowed:false},channels:[],people:[]}}));page.on('pageerror',e=>report.errors.push(e.message));
const snap=()=>page.evaluate(()=>window.__map.snapshot()),stats=()=>page.evaluate(()=>({compileShaders:window.__shaderCompiles,performance:window.__map.performance(),state:window.__map.snapshot()}));
try{
 await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>document.querySelector('#app')?.dataset.state==='entered',null,{timeout:120000});await page.mouse.move(-20,-20);
 await page.evaluate(()=>window.__map.reset());await page.waitForTimeout(500);report.before=await stats();await page.screenshot({path:out+'/bobst-before.png'});
 const center=await page.evaluate(()=>window.__map.project('bobst-library'));let hit;
 for(const [dx,dy]of [[0,0],[0,-30],[-30,0],[30,0],[0,30]]){const p={x:center.x+dx,y:center.y+dy};await page.mouse.move(p.x,p.y);await page.waitForTimeout(120);if((await snap()).hovered==='bobst-library'){hit=p;break;}}
 assert(hit,'No actual Bobst canvas hover');await page.waitForTimeout(650);report.hover=await stats();await page.screenshot({path:out+'/bobst-hover.png'});
 const baseRoot=report.before.state.landmarks.find(r=>r.id==='bobst-library'),hoverRoot=report.hover.state.landmarks.find(r=>r.id==='bobst-library');assert(Math.abs(hoverRoot.bounds.min[1]-baseRoot.bounds.min[1])<.03);assert.equal(hoverRoot.triangles,baseRoot.triangles);assert.equal(hoverRoot.meshes,baseRoot.meshes);
 await page.mouse.click(hit.x,hit.y);await page.waitForTimeout(300);report.selectedHover=await stats();assert.equal(report.selectedHover.state.selected,'bobst-library');assert(Math.abs(report.selectedHover.state.landmarks.find(r=>r.id==='bobst-library').bounds.min[1]-baseRoot.bounds.min[1])<.03);await page.screenshot({path:out+'/bobst-selected-hover.png'});
 await page.mouse.move(-20,-20);await page.waitForTimeout(55);await page.screenshot({path:out+'/bobst-leaving.png'});await page.waitForTimeout(500);report.left=await stats();await page.screenshot({path:out+'/bobst-left.png'});assert.equal(report.left.state.hovered,null);assert.equal(report.left.state.selected,'bobst-library');assert(Math.abs(report.left.state.landmarks.find(r=>r.id==='bobst-library').bounds.min[1]-baseRoot.bounds.min[1])<.03);
 await page.evaluate(p=>{window.__map.select(null);window.__map.restoreCamera(p);},report.before.state.camera);await page.waitForTimeout(500);report.cleared=await stats();await page.screenshot({path:out+'/bobst-cleared.png'});
 for(let i=0;i<3;i++){await page.mouse.move(hit.x,hit.y);await page.waitForTimeout(450);const active=await stats();await page.mouse.move(-20,-20);await page.waitForTimeout(450);report.cycles.push({active,afterIdle:await stats()});}
 assert.deepEqual(report.errors,[]);assert(report.cycles.every(c=>c.active.compileShaders===report.hover.compileShaders&&c.afterIdle.compileShaders===report.hover.compileShaders),'Repeated hover recompiled shaders');report.checks.push({name:'Actual Bobst white hover/click selection/pointerleave retain steady complete-geometry highlight with no movement or repeated shader compilation',pass:true,hit});report.pass=true;
}catch(e){report.failure=e.stack;process.exitCode=1;}finally{await browser.close();await fs.writeFile(out+'/browser-results.json',JSON.stringify(report,null,2)+'\n');console.log(report.pass?'PASS actual Bobst hover/leave/selected':report.failure);}
