import {chromium} from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='evidence/m40-assets', report={checks:[],errors:[],failedRequests:[],badResponses:[],assetResponses:[],limitations:['Installed headless Chrome; mobile viewport emulation, no physical touch hardware.','API routes intercepted; no real backend or model calls.']};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});report.chrome=browser.version();
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
await page.route('**/api/**',r=>r.fulfill({json:{chat:{configured:false},access:{allowed:false}}}));
page.on('pageerror',e=>report.errors.push(e.message));page.on('requestfailed',r=>report.failedRequests.push({url:r.url(),failure:r.failure()}));page.on('response',r=>{if(r.status()>=400)report.badResponses.push({url:r.url(),status:r.status()});if(/\.(glb|png)(?:\?|$)/.test(r.url()))report.assetResponses.push({url:r.url(),status:r.status()});});
const snap=()=>page.evaluate(()=>window.__map.snapshot());
const same=(a,b,e=.01)=>{for(const key of ['position','target'])a[key].forEach((n,i)=>assert(Math.abs(n-b[key][i])<e,key+i));};
const check=async(name,fn)=>{await fn();report.checks.push({name,pass:true});console.log('PASS '+name);};
const wait=ms=>page.waitForTimeout(ms);
try {
 const start=Date.now();await page.goto('http://127.0.0.1:4179');await page.waitForFunction(()=>window.__map?.snapshot().status==='ready',null,{timeout:90000});report.loadMs=Date.now()-start;
 if(await page.getByRole('button',{name:'Close assistant',exact:true}).isVisible())await page.getByRole('button',{name:'Close assistant',exact:true}).click();await page.mouse.move(5,5);await wait(500);report.initial=await snap();
 await check('Production loads 124 jobs and nine landmarks with no failures',async()=>{assert.equal(report.initial.loaded,124);assert.equal(report.initial.landmarks.length,9);assert.deepEqual(report.initial.failed,[]);assert.deepEqual(report.errors,[]);assert.deepEqual(report.badResponses,[]);assert.deepEqual(report.failedRequests,[]);});
 await check('All landmark bounds, meshes, triangles and campus counts match M31 baseline',async()=>{const old=JSON.parse(fs.readFileSync('evidence/m31-lipton-context/browser-results.json'));assert.equal(report.initial.loaded,old.initial.loaded);for(const landmark of report.initial.landmarks){const prior=old.initial.landmarks.find(x=>x.id===landmark.id);assert(prior,landmark.id);assert.equal(landmark.triangles,prior.triangles);assert.equal(landmark.meshes,prior.meshes);assert.deepEqual(landmark.bounds,prior.bounds);}for(const key of ['removedColesTriangles','removedKimmelTriangles','removedGlobalCenterTriangles','removedSilverCenterTriangles','streetParkStats','parkVegetation'])if(key in old.initial)assert.deepEqual(report.initial[key],old.initial[key],key);});
 await page.screenshot({path:out+'/desktop-overview.png'});
 report.interactions=[];
 for(const id of ['courant-institute','stern-school-of-business','bobst-library'])await check('Real hover/click, complete lift, focus and return: '+id,async()=>{
  await page.mouse.move(5,5);await page.evaluate(()=>window.__map.reset());await wait(1500);const overview=(await snap()).camera;
  await page.evaluate(id=>{window.__map.select(id);window.__map.focus();},id);await wait(1700);
  const base=(await snap()).landmarks.find(x=>x.id===id);let hit;
  for(const [dx,dy] of [[0,0],[0,-30],[0,30],[-30,0],[30,0],[-60,0],[60,0],[0,-60]]){await page.mouse.move(base.screen.x+dx,base.screen.y+dy);await wait(100);if((await snap()).hovered===id){hit={x:base.screen.x+dx,y:base.screen.y+dy};break;}}
  assert(hit,'No real pointer hit '+id);await wait(700);const raised=(await snap()).landmarks.find(x=>x.id===id);const lift=raised.bounds.min[1]-base.bounds.min[1];assert(lift>3);assert(Math.abs(lift-(raised.bounds.max[1]-base.bounds.max[1]))<.01);assert.equal(raised.triangles,base.triangles);assert.equal(raised.meshes,base.meshes);
  if(base.parts)for(let j=0;j<base.parts.length;j++)for(const edge of ['min','max'])for(let axis=0;axis<3;axis++)assert(Math.abs(raised.parts[j].bounds[edge][axis]-base.parts[j].bounds[edge][axis]-(axis===1?lift:0))<.01,'Merged part motion '+base.parts[j].name);
  await page.evaluate(()=>window.__map.select(null));await page.mouse.click(hit.x,hit.y);await page.mouse.move(5,5);await wait(1700);const focused=await snap();assert.equal(focused.selected,id);assert.notDeepEqual(focused.camera,overview);
  await page.screenshot({path:out+'/'+id+'-focused.png'});await page.mouse.move(1150,250);await page.mouse.wheel(0,120);await wait(1700);same((await snap()).camera,overview);report.interactions.push({id,hit,lift,meshes:base.meshes,triangles:base.triangles,camera:focused.camera});
 });
 await check('All nine landmark selection identifiers survive relocation',async()=>{for(const x of report.initial.landmarks){await page.evaluate(id=>window.__map.select(id),x.id);assert.equal((await snap()).selected,x.id);}await page.evaluate(()=>window.__map.reset());await wait(1400);});
 await check('Mobile map fills viewport and pointer orbit responds',async()=>{await page.setViewportSize({width:390,height:844});await wait(600);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);assert.deepEqual(await page.locator('#map canvas').evaluate(e=>[e.clientWidth,e.clientHeight]),[390,844]);const before=(await snap()).camera;await page.mouse.move(270,330);await page.mouse.down();await page.mouse.move(340,390,{steps:12});await page.mouse.up();await wait(700);assert.notDeepEqual((await snap()).camera,before);await page.screenshot({path:out+'/mobile-overview.png'});});
 await check('No browser or network failures after interaction',async()=>{assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedRequests,[]);assert.deepEqual(report.badResponses,[]);assert(report.assetResponses.length>100);});report.final=await snap();
} catch(e) {report.failure=e.stack;console.error(e.stack);process.exitCode=1;} finally {await browser.close();fs.writeFileSync(out+'/browser-results.json',JSON.stringify(report,null,2)+'\n');}
