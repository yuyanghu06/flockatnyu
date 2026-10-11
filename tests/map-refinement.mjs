import { chromium } from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out=process.env.MAP_EVIDENCE??'evidence/m3-campus-details';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(8000);
const report={browser:browser.version(),viewport:[1440,1000],checks:[],errors:[],missing:[]};
page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)report.missing.push({url:r.url(),status:r.status()});});page.on('requestfailed',r=>report.missing.push({url:r.url(),failure:r.failure()}));
const snapshot=()=>page.evaluate(()=>window.__map.snapshot());
const settle=()=>page.waitForTimeout(500);
const difference=c=>c.position.map((v,i)=>v-c.target[i]);
function close(a,b,tolerance=1e-7){assert.equal(a.length,b.length);a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<tolerance,`${v} != ${b[i]}`));}
async function restore(c){await page.click('#camera-open');await page.fill('#camera-json',JSON.stringify(c));await page.click('#camera-restore');const message=await page.locator('#camera-message').textContent();await page.locator('#camera-dialog .close').click();await settle();return message;}
async function drag(x1,y1,x2,y2,button='left'){await page.mouse.move(x1,y1);await page.mouse.down({button});await page.mouse.move(x2,y2,{steps:15});await page.mouse.up({button});await settle();}
async function check(name,fn){console.log('CHECK '+name);try{report.checks.push({name,pass:true,detail:await fn()});}catch(e){report.checks.push({name,pass:false,error:e.stack});console.log('FAIL '+e.message);await page.evaluate(()=>document.querySelector('dialog[open]')?.close());}}
try{
await page.goto(process.env.MAP_URL??'http://127.0.0.1:4173');await page.waitForFunction(()=>window.__map?.snapshot().status==='ready',null,{timeout:60000});await settle();report.initial=await snapshot();
await page.screenshot({path:`${out}/01-default-campus.png`});
await check('expanded production coverage and source placement',async()=>{
 assert.equal(report.errors.length,0);assert.equal(report.missing.length,0);assert.equal(report.initial.failed.length,0);
 assert.equal(report.initial.navigation.loadedTileCount,110);assert.equal(report.initial.removedColesTriangles,92);
 assert.deepEqual(report.initial.navigation.mapExtent,{minX:-960,maxX:960,minZ:-960,maxZ:1152});
 const p=report.initial.landmarks.find(x=>x.id==='nyu-john-a-paulson-center');assert.ok(p.bounds.max[1]-p.bounds.min[1]>85);assert.ok(p.bounds.min[2]>400&&p.bounds.max[2]<545);
 return {loaded:report.initial.loaded,navigation:report.initial.navigation,paulson:p};
});
await check('starting zoom, free orbit and reset',async()=>{
 const c=report.initial.camera;assert.ok(Math.abs(Math.hypot(...difference(c))-240.97521330083552)<1e-7);assert.equal(c.fov,43);
 await drag(970,420,1130,470);const moved=(await snapshot()).camera;assert.notDeepEqual(moved.position,c.position);close(moved.target,c.target);
 await page.click('#reset');await settle();close((await snapshot()).camera.position,c.position);return {distance:Math.hypot(...difference(c)),initial:c,orbited:moved};
});
await check('bounded pan translates camera and target without angle snapping',async()=>{
 const limits=report.initial.navigation.cameraLimits.targetBounds,base=report.initial.camera,results=[];
 for(const [label,x,z,dx,dy] of [['south-east',limits.maxX,limits.maxZ,-360,250],['south-west',limits.minX,limits.maxZ,360,250],['north-east',limits.maxX,limits.minZ,-360,-250],['north-west',limits.minX,limits.minZ,360,-250]]){
   const target=[x,12,z],c={...base,target,position:[x+200,212,z+200]};assert.equal(await restore(c),'Saved angle restored.');
   const before=(await snapshot()).camera;await drag(950,460,950+dx,460+dy,'right');const after=(await snapshot()).camera;
   assert.ok(after.target[0]>=limits.minX-1e-8&&after.target[0]<=limits.maxX+1e-8);assert.ok(after.target[2]>=limits.minZ-1e-8&&after.target[2]<=limits.maxZ+1e-8);
   close(difference(after),difference(before),1e-6);assert.ok(Math.abs(after.target[0]-x)<1e-6||Math.abs(after.target[2]-z)<1e-6,'Expected one boundary held');
   await page.screenshot({path:`${out}/boundary-${label}.png`});results.push({label,before,after});
 }
 return results;
});
await check('in-bounds roundtrip exact and outside restore rejected',async()=>{
 const c={...report.initial.camera,target:[0,30,450],position:[150,150,600]};assert.equal(await restore(c),'Saved angle restored.');close((await snapshot()).camera.position,c.position);close((await snapshot()).camera.target,c.target);
 const before=(await snapshot()).camera;const message=await restore({...c,target:[2000,30,450],position:[2150,150,600]});assert.match(message,/Could not restore/);close((await snapshot()).camera.position,before.position);
 return {restored:c,rejection:message};
});
await check('all six selectable buildings and complete Paulson hit from multiple sides',async()=>{
 const selected=[];
 for(const {id}of report.initial.landmarks){await page.click('#reset');await page.selectOption('#building',id);assert.equal((await snapshot()).selected,id);await page.click('#focus');await settle();await page.click('#clear');const p=await page.evaluate(id=>window.__map.project(id),id);let hit;
 for(const[dx,dy]of[[0,0],[0,-40],[-40,-40],[40,-40],[0,40],[-70,0],[70,0]]){await page.mouse.move(p.x+dx,p.y+dy);await page.waitForTimeout(20);if((await snapshot()).hovered===id){hit={x:p.x+dx,y:p.y+dy};break;}}
 assert.ok(hit,'No hit '+id);await page.mouse.click(hit.x,hit.y);assert.equal((await snapshot()).selected,id);selected.push(id);}
 const p=report.initial.landmarks.find(x=>x.id==='nyu-john-a-paulson-center');const target=p.bounds.min.map((v,i)=>(v+p.bounds.max[i])/2);
 const sideHits=[];
 for(const[label,offset]of[['south-east',[210,150,210]],['north-west',[-210,150,-210]],['south-west',[-230,120,190]]]){
 await page.click('#clear');assert.equal(await restore({...report.initial.camera,target,position:target.map((v,i)=>v+offset[i])}),'Saved angle restored.');
 await page.mouse.move(10,990);await page.screenshot({path:`${out}/paulson-${label}.png`});
 let hit;for(const[x,y]of[[720,500],[850,400],[570,490],[720,450],[690,400],[755,385],[750,520],[830,550],[570,650]]){await page.mouse.move(x,y);await page.waitForTimeout(30);if((await snapshot()).hovered===p.id){hit={x,y};break;}}
 assert.ok(hit,'Paulson side hit '+label);await page.mouse.click(hit.x,hit.y);assert.equal((await snapshot()).selected,p.id);sideHits.push({label,hit});
 }
 await page.screenshot({path:`${out}/paulson-selected.png`});return {selected,sideHits,paulson:(await snapshot()).landmarks.find(x=>x.id===p.id)};
});
await check('default GPU rendering observations',async()=>{
 if(await page.locator('#clear').isVisible())await page.click('#clear');await page.click('#reset');await settle();
 return await page.evaluate(async()=>{const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');const renderer=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);const times=await new Promise(resolve=>{let last=performance.now();const values=[];function frame(t){values.push(t-last);last=t;if(values.length<91)requestAnimationFrame(frame);else resolve(values.slice(1));}requestAnimationFrame(frame);});times.sort((a,b)=>a-b);const mean=times.reduce((a,b)=>a+b)/times.length;return {renderer,frames:times.length,meanMs:mean,fps:1000/mean,p95Ms:times[Math.floor(times.length*.95)],render:window.__map.snapshot().render};});
});
report.final=await snapshot();
}catch(e){report.fatal=e.stack;}
await browser.close();fs.writeFileSync(`${out}/browser-results.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks,errors:report.errors,missing:report.missing,fatal:report.fatal},null,2));if(report.fatal||report.checks.some(x=>!x.pass))process.exitCode=1;
